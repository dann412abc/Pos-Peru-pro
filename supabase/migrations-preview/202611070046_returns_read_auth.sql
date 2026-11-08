-- PREVIEW ONLY: consultas autenticadas de devoluciones; no registra ni modifica operaciones.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_devoluciones_listar_auth(p_sucursal_id integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_usuario integer; v_empresa integer; v_ids integer[];
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 SELECT u.id,u.empresa_id INTO v_usuario,v_empresa FROM public.usuario u WHERE u.supabase_auth_user_id=v_auth AND u.activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(array_agg(us.sucursal_id),ARRAY[]::integer[]) INTO v_ids FROM public.usuario_sucursal us
 JOIN public.sucursal s ON s.id=us.sucursal_id AND s.empresa_id=v_empresa
 WHERE us.usuario_id=v_usuario AND (p_sucursal_id IS NULL OR us.sucursal_id=p_sucursal_id);
 IF p_sucursal_id IS NOT NULL AND NOT (p_sucursal_id=ANY(v_ids)) THEN RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(x ORDER BY x->>'createdAt' DESC) FROM (
  SELECT jsonb_build_object('id',d.id,'comprobanteId',d.comprobante_id,'sucursalId',d.sucursal_id,'motivo',d.motivo,
   'totalDevolucion',d.total_devolucion,'creditoRevertido',d.credito_revertido,'montoReembolsado',d.monto_reembolsado,
   'createdAt',d.created_at,'tipo',c.tipo,'serie',c.serie,'correlativo',c.correlativo,'clienteNombre',cl.nombre,
   'responsable',u.nombre,'lineas',(SELECT count(*) FROM public.devolucion_venta_linea dl WHERE dl.devolucion_id=d.id),
   'notaCreditoId',nc.id,'notaCreditoSerie',nc.serie,'notaCreditoCorrelativo',nc.correlativo) AS x
  FROM public.devolucion_venta d JOIN public.comprobante c ON c.id=d.comprobante_id AND c.empresa_id=d.empresa_id
  JOIN public.cliente cl ON cl.id=d.cliente_id AND cl.empresa_id=d.empresa_id
  JOIN public.usuario u ON u.id=d.usuario_id AND u.empresa_id=d.empresa_id
  LEFT JOIN public.comprobante nc ON nc.devolucion_venta_id=d.id AND nc.empresa_id=d.empresa_id AND nc.tipo='07'
  WHERE d.empresa_id=v_empresa AND d.sucursal_id=ANY(v_ids) ORDER BY d.created_at DESC,d.id DESC LIMIT 300
 ) q), '[]'::jsonb);
END; $fn$;

CREATE OR REPLACE FUNCTION public.pos_devoluciones_buscar_auth(p_termino text,p_sucursal_id integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_usuario integer; v_empresa integer; v_ids integer[]; v_q text:=btrim(COALESCE(p_termino,''));
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 IF length(v_q)<2 OR length(v_q)>80 THEN RAISE EXCEPTION 'Ingrese entre 2 y 80 caracteres para buscar' USING ERRCODE='22023'; END IF;
 SELECT u.id,u.empresa_id INTO v_usuario,v_empresa FROM public.usuario u WHERE u.supabase_auth_user_id=v_auth AND u.activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(array_agg(us.sucursal_id),ARRAY[]::integer[]) INTO v_ids FROM public.usuario_sucursal us JOIN public.sucursal s ON s.id=us.sucursal_id AND s.empresa_id=v_empresa
 WHERE us.usuario_id=v_usuario AND (p_sucursal_id IS NULL OR us.sucursal_id=p_sucursal_id);
 IF p_sucursal_id IS NOT NULL AND NOT (p_sucursal_id=ANY(v_ids)) THEN RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM (
  SELECT c.id,c.tipo,c.serie,c.correlativo,c.total,c.estado,c.fecha_emision AS "fechaEmision",jsonb_build_object('nombre',cl.nombre) AS cliente
  FROM public.comprobante c JOIN public.cliente cl ON cl.id=c.cliente_id AND cl.empresa_id=c.empresa_id
  WHERE c.empresa_id=v_empresa AND c.sucursal_id=ANY(v_ids) AND c.tipo IN ('01','03') AND c.estado<>'ANULADA'
   AND (c.serie ILIKE '%'||v_q||'%' OR c.correlativo::text ILIKE '%'||v_q||'%' OR (c.serie||'-'||lpad(c.correlativo::text,8,'0')) ILIKE '%'||v_q||'%' OR cl.nombre ILIKE '%'||v_q||'%' OR COALESCE(cl.numero,'') ILIKE '%'||v_q||'%')
  ORDER BY c.fecha_emision DESC,c.id DESC LIMIT 100
 ) r),'[]'::jsonb);
END; $fn$;

CREATE OR REPLACE FUNCTION public.pos_devolucion_disponibilidad_auth(p_comprobante_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_usuario integer; v_empresa integer; v_ids integer[]; v_c jsonb; v_lineas jsonb; v_cuenta jsonb;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 SELECT u.id,u.empresa_id INTO v_usuario,v_empresa FROM public.usuario u WHERE u.supabase_auth_user_id=v_auth AND u.activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(array_agg(us.sucursal_id),ARRAY[]::integer[]) INTO v_ids FROM public.usuario_sucursal us JOIN public.sucursal s ON s.id=us.sucursal_id AND s.empresa_id=v_empresa WHERE us.usuario_id=v_usuario;
 SELECT to_jsonb(x) INTO v_c FROM (SELECT c.id,c.sucursal_id AS "sucursalId",c.cliente_id AS "clienteId",c.tipo,c.serie,c.correlativo,c.total,c.estado,c.fecha_emision AS "fechaEmision",cl.nombre AS "clienteNombre"
  FROM public.comprobante c JOIN public.cliente cl ON cl.id=c.cliente_id AND cl.empresa_id=c.empresa_id
  WHERE c.id=p_comprobante_id AND c.empresa_id=v_empresa AND c.sucursal_id=ANY(v_ids)) x;
 IF v_c IS NULL THEN RAISE EXCEPTION 'Comprobante no encontrado o no autorizado' USING ERRCODE='42501'; END IF;
 IF v_c->>'tipo' NOT IN ('01','03') THEN RAISE EXCEPTION 'Solo se permiten devoluciones de boletas y facturas' USING ERRCODE='22023'; END IF;
 IF v_c->>'estado'='ANULADA' THEN RAISE EXCEPTION 'No se puede devolver un comprobante anulado' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l."comprobanteLineaId"),'[]'::jsonb) INTO v_lineas FROM (
  SELECT cl.id AS "comprobanteLineaId",cl.producto_id AS "productoId",cl.variante_id AS "varianteId",p.codigo,p.nombre AS "productoNombre",pv.nombre AS "varianteNombre",
   cl.cantidad AS "cantidadOriginal",cl.precio_unitario AS "precioUnitario",cl.subtotal AS "importeOriginal",COALESCE(dev.cantidad_devuelta,0) AS "cantidadDevuelta",
   GREATEST(0,cl.cantidad-COALESCE(dev.cantidad_devuelta,0)) AS "cantidadDisponible",GREATEST(0,cl.subtotal-COALESCE(dev.importe_devuelto,0)) AS "importeDisponible"
  FROM public.comprobante_linea cl JOIN public.producto p ON p.id=cl.producto_id AND p.empresa_id=v_empresa
  LEFT JOIN public.producto_variante pv ON pv.id=cl.variante_id AND pv.producto_id=cl.producto_id AND pv.empresa_id=p.empresa_id
  LEFT JOIN LATERAL (SELECT SUM(dl.cantidad)::numeric cantidad_devuelta,SUM(dl.monto)::numeric importe_devuelto FROM public.devolucion_venta_linea dl JOIN public.devolucion_venta d ON d.id=dl.devolucion_id WHERE dl.comprobante_linea_id=cl.id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA') dev ON true
  WHERE cl.comprobante_id=p_comprobante_id
 ) l;
 SELECT to_jsonb(cc) INTO v_cuenta FROM (SELECT id,saldo_pendiente AS "saldoPendiente",total_credito AS "totalCredito" FROM public.cuenta_cobrar WHERE comprobante_id=p_comprobante_id AND empresa_id=v_empresa AND sucursal_id=(v_c->>'sucursalId')::integer LIMIT 1) cc;
 RETURN jsonb_build_object('comprobante',v_c,'lineas',v_lineas,'cuentaCredito',v_cuenta);
END; $fn$;

REVOKE ALL ON FUNCTION public.pos_devoluciones_listar_auth(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_devoluciones_buscar_auth(text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_devolucion_disponibilidad_auth(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_devoluciones_listar_auth(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_devoluciones_buscar_auth(text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_devolucion_disponibilidad_auth(integer) TO authenticated;
COMMIT;
