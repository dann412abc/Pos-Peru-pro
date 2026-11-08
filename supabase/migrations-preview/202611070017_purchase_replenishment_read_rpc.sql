-- PREVIEW SOLAMENTE. Revisar columnas/índices del esquema real y probar en staging.
-- Reposición sugerida: una sucursal autorizada; no crea órdenes ni modifica existencias.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compras_sugerencias_reposicion_auth(p_sucursal_id integer)
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
 WITH demanda AS (
   SELECT mi.sucursal_id,mi.producto_id,mi.variante_id,SUM(mi.cantidad)::numeric unidades_vendidas,
     COUNT(DISTINCT mi.created_at::date)::integer dias_con_venta,MAX(mi.created_at) ultima_venta
   FROM public.movimiento_inventario mi
   WHERE mi.empresa_id=v_empresa AND mi.sucursal_id=p_sucursal_id AND mi.tipo='SALIDA'
     AND mi.comprobante_id IS NOT NULL AND mi.transferencia_id IS NULL
     AND mi.created_at>=NOW()-INTERVAL '30 days'
   GROUP BY mi.sucursal_id,mi.producto_id,mi.variante_id
 ), base AS (
   SELECT ps.sucursal_id,ps.producto_id,NULL::integer variante_id,p.nombre producto_nombre,NULL::text variante_nombre,
     p.codigo,p.unidad,ps.stock::numeric stock,ps.stock_minimo::numeric stock_minimo,
     COALESCE(ps.costo_promedio,0)::numeric costo_promedio,d.unidades_vendidas,d.ultima_venta,p.activo
   FROM public.producto_stock ps JOIN public.producto p ON p.id=ps.producto_id AND p.empresa_id=ps.empresa_id
   LEFT JOIN demanda d ON d.sucursal_id=ps.sucursal_id AND d.producto_id=ps.producto_id AND d.variante_id IS NULL
   WHERE ps.empresa_id=v_empresa AND ps.sucursal_id=p_sucursal_id AND p.activo=true
   UNION ALL
   SELECT vs.sucursal_id,pv.producto_id,pv.id,p.nombre,pv.nombre,COALESCE(pv.codigo,p.codigo),p.unidad,
     vs.stock::numeric,vs.stock_minimo::numeric,COALESCE(vs.costo_promedio,0)::numeric,d.unidades_vendidas,d.ultima_venta,(p.activo AND pv.activo)
   FROM public.producto_variante_stock vs JOIN public.producto_variante pv ON pv.id=vs.variante_id AND pv.empresa_id=vs.empresa_id
   JOIN public.producto p ON p.id=pv.producto_id AND p.empresa_id=pv.empresa_id
   LEFT JOIN demanda d ON d.sucursal_id=vs.sucursal_id AND d.producto_id=pv.producto_id AND d.variante_id=pv.id
   WHERE vs.empresa_id=v_empresa AND vs.sucursal_id=p_sucursal_id AND p.activo=true AND pv.activo=true
 ), sugerencias AS (
   SELECT b.*,s.nombre sucursal_nombre,COALESCE(b.unidades_vendidas,0)::numeric vendidas,
     CASE WHEN COALESCE(b.unidades_vendidas,0)>0 THEN ROUND(b.stock/(b.unidades_vendidas/30.0),1) ELSE NULL END dias_cobertura,
     GREATEST(0,CEIL((COALESCE(b.unidades_vendidas,0)/30.0)*14-b.stock),
       CASE WHEN b.stock_minimo>0 AND b.stock<b.stock_minimo THEN CEIL(b.stock_minimo-b.stock) ELSE 0 END)::numeric cantidad_sugerida
   FROM base b JOIN public.sucursal s ON s.id=b.sucursal_id
   WHERE b.activo=true AND (b.stock<=b.stock_minimo OR (COALESCE(b.unidades_vendidas,0)>0 AND b.stock/(b.unidades_vendidas/30.0)<=14))
 )
 SELECT jsonb_build_object('sugerencias',COALESCE(jsonb_agg(jsonb_build_object(
   'sucursalId',x.sucursal_id,'sucursalNombre',x.sucursal_nombre,'productoId',x.producto_id,'varianteId',x.variante_id,
   'productoNombre',x.producto_nombre,'varianteNombre',x.variante_nombre,'codigo',x.codigo,'unidad',x.unidad,'stock',x.stock,
   'stockMinimo',x.stock_minimo,'unidadesVendidas30d',x.vendidas,'promedioDiario',ROUND(x.vendidas/30.0,3),
   'diasCobertura',x.dias_cobertura,'ultimaVenta',x.ultima_venta,'cantidadSugerida',x.cantidad_sugerida,
   'inversionEstimada',ROUND(x.cantidad_sugerida*x.costo_promedio,2),
   'prioridad',CASE WHEN x.stock<=0 THEN 'AGOTADO' WHEN x.stock_minimo>0 AND x.stock<=x.stock_minimo THEN 'STOCK_BAJO'
     WHEN x.dias_cobertura<=7 THEN 'REPOSICION_URGENTE' ELSE 'REPOSICION' END,
   'ultimoProveedorId',lp.proveedor_id,'ultimoProveedorNombre',lp.proveedor_nombre
 ) ORDER BY CASE WHEN x.stock<=0 THEN 0 WHEN x.stock<=x.stock_minimo THEN 1 WHEN x.dias_cobertura<=7 THEN 2 ELSE 3 END,
   x.vendidas DESC) FILTER(WHERE x.cantidad_sugerida>0),'[]'::jsonb)) INTO v_result
 FROM sugerencias x
 LEFT JOIN LATERAL (
   SELECT c.proveedor_id,pr.nombre proveedor_nombre FROM public.compra c
   JOIN public.compra_linea cl ON cl.compra_id=c.id AND cl.empresa_id=c.empresa_id
   JOIN public.proveedor pr ON pr.id=c.proveedor_id AND pr.empresa_id=c.empresa_id
   WHERE c.empresa_id=v_empresa AND c.sucursal_id=x.sucursal_id AND c.estado='RECIBIDA'
     AND ((x.variante_id IS NULL AND cl.producto_id=x.producto_id AND cl.variante_id IS NULL) OR cl.variante_id=x.variante_id)
   ORDER BY c.fecha_registro DESC,c.id DESC LIMIT 1
 ) lp ON true;
 RETURN COALESCE(v_result,'{"sugerencias":[]} '::jsonb);
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compras_sugerencias_reposicion_auth(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_compras_sugerencias_reposicion_auth(integer) TO authenticated;
COMMIT;
