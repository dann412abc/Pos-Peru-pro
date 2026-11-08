-- PREVIEW SOLAMENTE. Revisar esquema y ejecutar primero en staging.
-- Analítica de proveedores limitada a la sucursal autorizada de auth.uid().
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compras_analisis_proveedores_auth(p_sucursal_id integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_user integer; v_empresa integer; v_result jsonb;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 SELECT id,empresa_id INTO v_user,v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
 IF v_user IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 IF p_sucursal_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.usuario_sucursal us JOIN public.sucursal s ON s.id=us.sucursal_id
   WHERE us.usuario_id=v_user AND us.sucursal_id=p_sucursal_id AND s.empresa_id=v_empresa
 ) THEN RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;
 WITH compras_proveedor AS (
   SELECT c.proveedor_id, count(*)::integer cantidad_compras, sum(c.total)::numeric(14,2) total_comprado,
     sum(c.saldo_pendiente)::numeric(14,2) saldo_pendiente, max(c.fecha_documento) ultima_compra
   FROM public.compra c WHERE c.empresa_id=v_empresa AND c.sucursal_id=p_sucursal_id AND c.estado='RECIBIDA'
   GROUP BY c.proveedor_id
 ), devoluciones AS (
   SELECT d.proveedor_id,count(*)::integer cantidad_devoluciones,sum(d.total)::numeric(14,2) total_devuelto
   FROM public.devolucion_proveedor d WHERE d.empresa_id=v_empresa AND d.sucursal_id=p_sucursal_id
   GROUP BY d.proveedor_id
 ), ordenes AS (
   SELECT o.proveedor_id,count(*) FILTER(WHERE o.estado IN ('RECIBIDA','RECIBIDA_PARCIAL'))::integer ordenes_con_recepcion,
     count(*) FILTER(WHERE o.estado='RECIBIDA' AND (o.fecha_entrega_esperada IS NULL OR r.ultima_recepcion::date<=o.fecha_entrega_esperada))::integer ordenes_a_tiempo
   FROM public.orden_compra o LEFT JOIN LATERAL (
     SELECT max(x.created_at) ultima_recepcion FROM public.orden_compra_recepcion x WHERE x.empresa_id=o.empresa_id AND x.orden_compra_id=o.id
   ) r ON true
   WHERE o.empresa_id=v_empresa AND o.sucursal_id=p_sucursal_id GROUP BY o.proveedor_id
 ), proveedores_json AS (
   SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'proveedorId',p.id,'proveedorNombre',p.nombre,'tipoDoc',p.tipo_doc,'numero',p.numero,
     'cantidadCompras',COALESCE(cp.cantidad_compras,0),'totalComprado',COALESCE(cp.total_comprado,0),
     'saldoPendiente',COALESCE(cp.saldo_pendiente,0),'ultimaCompra',cp.ultima_compra,
     'totalDevuelto',COALESCE(d.total_devuelto,0),'cantidadDevoluciones',COALESCE(d.cantidad_devoluciones,0),
     'ordenesConRecepcion',COALESCE(o.ordenes_con_recepcion,0),'ordenesATiempo',COALESCE(o.ordenes_a_tiempo,0)
   ) ORDER BY p.nombre),'[]'::jsonb) data
   FROM public.proveedor p LEFT JOIN compras_proveedor cp ON cp.proveedor_id=p.id
   LEFT JOIN devoluciones d ON d.proveedor_id=p.id LEFT JOIN ordenes o ON o.proveedor_id=p.id
   WHERE p.empresa_id=v_empresa AND p.activo=true
 ), precios AS (
   SELECT c.id compra_id,c.proveedor_id,p.nombre proveedor_nombre,cl.producto_id,cl.variante_id,
     pr.nombre producto_nombre,cl.variante_nombre,cl.costo_unitario,c.fecha_documento,
     row_number() OVER(PARTITION BY c.proveedor_id,cl.producto_id,COALESCE(cl.variante_id,0) ORDER BY c.fecha_documento DESC,c.id DESC,cl.id DESC) rn
   FROM public.compra c JOIN public.proveedor p ON p.id=c.proveedor_id AND p.empresa_id=c.empresa_id
   JOIN public.compra_linea cl ON cl.compra_id=c.id AND cl.empresa_id=c.empresa_id
   JOIN public.producto pr ON pr.id=cl.producto_id AND pr.empresa_id=cl.empresa_id
   WHERE c.empresa_id=v_empresa AND c.sucursal_id=p_sucursal_id AND c.estado='RECIBIDA'
 ), recientes AS (
   SELECT COALESCE(jsonb_agg(jsonb_build_object('compraId',compra_id,'proveedorId',proveedor_id,'proveedorNombre',proveedor_nombre,
     'productoId',producto_id,'productoNombre',producto_nombre,'varianteId',variante_id,'varianteNombre',variante_nombre,
     'costoUnitario',costo_unitario,'fechaDocumento',fecha_documento) ORDER BY fecha_documento DESC,compra_id DESC),'[]'::jsonb) data
   FROM (SELECT * FROM precios WHERE rn<=5 ORDER BY fecha_documento DESC,compra_id DESC LIMIT 500) x
 ), comparacion AS (
   SELECT COALESCE(jsonb_agg(jsonb_build_object('productoId',producto_id,'productoNombre',producto_nombre,'varianteId',variante_id,
     'varianteNombre',variante_nombre,'proveedorId',proveedor_id,'proveedorNombre',proveedor_nombre,
     'costoUnitario',costo_unitario,'fechaDocumento',fecha_documento,'esMasEconomico',costo_unitario=min_cost)
     ORDER BY producto_nombre,COALESCE(variante_nombre,''),costo_unitario),'[]'::jsonb) data
   FROM (SELECT p.*,min(costo_unitario) OVER(PARTITION BY producto_id,COALESCE(variante_id,0)) min_cost,
     row_number() OVER(PARTITION BY proveedor_id,producto_id,COALESCE(variante_id,0) ORDER BY fecha_documento DESC,compra_id DESC) rn
     FROM precios p) x WHERE rn=1
 )
 SELECT jsonb_build_object('proveedores',(SELECT data FROM proveedores_json),
   'preciosRecientes',(SELECT data FROM recientes),'comparacionCostos',(SELECT data FROM comparacion)) INTO v_result;
 RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compras_analisis_proveedores_auth(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_compras_analisis_proveedores_auth(integer) TO authenticated;
COMMIT;
