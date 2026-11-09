-- PREVIEW ONLY: conciliación de devoluciones de venta en el arqueo de caja.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_caja_resumen_auth(p_caja_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
 v_auth uuid:=auth.uid(); v_usuario integer; v_empresa integer; v_sucursal integer;
 v_saldo numeric(12,2); v_ventas integer; v_total numeric(12,2);
 v_efectivo numeric(12,2); v_efectivo_fisico numeric(12,2); v_tarjeta numeric(12,2); v_yape numeric(12,2); v_plin numeric(12,2); v_credito numeric(12,2);
 v_mov_efectivo numeric(12,2); v_dev_total numeric(12,2); v_dev_efectivo numeric(12,2);
 v_dev_tarjeta numeric(12,2); v_dev_yape numeric(12,2); v_dev_plin numeric(12,2);
 v_efectivo_esperado numeric(12,2);
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 SELECT u.id,u.empresa_id INTO v_usuario,v_empresa FROM public.usuario u WHERE u.auth_user_id=v_auth AND u.activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 SELECT c.sucursal_id,c.saldo_inicial INTO v_sucursal,v_saldo
 FROM public.caja c JOIN public.sucursal s ON s.id=c.sucursal_id AND s.empresa_id=v_empresa
 JOIN public.usuario_sucursal us ON us.sucursal_id=c.sucursal_id AND us.usuario_id=v_usuario
 WHERE c.id=p_caja_id AND c.usuario_id=v_usuario;
 IF NOT FOUND THEN RAISE EXCEPTION 'Caja no encontrada o no autorizada' USING ERRCODE='42501'; END IF;
 SELECT COUNT(*)::integer,COALESCE(SUM(c.total),0)::numeric(12,2) INTO v_ventas,v_total
 FROM public.comprobante c WHERE c.caja_id=p_caja_id AND c.empresa_id=v_empresa AND c.estado <> 'ANULADA';
 SELECT
 COALESCE(SUM(monto) FILTER(WHERE metodo='EFECTIVO'),0),COALESCE(SUM(monto) FILTER(WHERE metodo='TARJETA'),0),
 COALESCE(SUM(monto) FILTER(WHERE metodo='YAPE'),0),COALESCE(SUM(monto) FILTER(WHERE metodo='PLIN'),0),
 COALESCE(SUM(monto) FILTER(WHERE metodo='CREDITO'),0)
 INTO v_efectivo,v_tarjeta,v_yape,v_plin,v_credito
 FROM (
  SELECT cp.metodo_pago metodo,cp.monto FROM public.comprobante_pago cp JOIN public.comprobante c ON c.id=cp.comprobante_id
  WHERE c.caja_id=p_caja_id AND c.empresa_id=v_empresa AND c.estado <> 'ANULADA'
  UNION ALL SELECT c.metodo_pago,c.total FROM public.comprobante c
  WHERE c.caja_id=p_caja_id AND c.empresa_id=v_empresa AND c.estado <> 'ANULADA'
   AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=c.id)
 ) cobros;
 -- El efectivo físico conserva cobros de ventas anuladas; sus reembolsos
 -- ya están persistidos como SALIDA en caja_movimiento y no deben duplicarse.
 SELECT COALESCE(SUM(monto),0) INTO v_efectivo_fisico
 FROM (
  SELECT cp.monto FROM public.comprobante_pago cp JOIN public.comprobante c ON c.id=cp.comprobante_id
  WHERE c.caja_id=p_caja_id AND c.empresa_id=v_empresa AND cp.metodo_pago='EFECTIVO'
  UNION ALL
  SELECT c.total FROM public.comprobante c
  WHERE c.caja_id=p_caja_id AND c.empresa_id=v_empresa AND c.metodo_pago='EFECTIVO'
   AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=c.id)
 ) efectivo_fisico;
 SELECT COALESCE(SUM(d.total_devolucion),0) INTO v_dev_total
 FROM public.devolucion_venta d
 WHERE d.caja_id=p_caja_id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA';
 SELECT
 COALESCE(SUM(dp.monto) FILTER(WHERE dp.metodo_pago='EFECTIVO'),0),
 COALESCE(SUM(dp.monto) FILTER(WHERE dp.metodo_pago='TARJETA'),0),
 COALESCE(SUM(dp.monto) FILTER(WHERE dp.metodo_pago='YAPE'),0),
 COALESCE(SUM(dp.monto) FILTER(WHERE dp.metodo_pago='PLIN'),0)
 INTO v_dev_efectivo,v_dev_tarjeta,v_dev_yape,v_dev_plin
 FROM public.devolucion_venta_pago dp
 JOIN public.devolucion_venta d ON d.id=dp.devolucion_id AND d.empresa_id=dp.empresa_id
 WHERE d.caja_id=p_caja_id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA';
 SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END)
 FILTER(WHERE metodo_pago='EFECTIVO'),0) INTO v_mov_efectivo
 FROM public.caja_movimiento WHERE caja_id=p_caja_id AND usuario_id=v_usuario;
 -- Los reembolsos ya generan una SALIDA en caja_movimiento; no restarlos dos veces.
 v_efectivo_esperado:=round(COALESCE(v_saldo,0)+COALESCE(v_efectivo_fisico,0)+COALESCE(v_mov_efectivo,0),2);
 RETURN jsonb_build_object(
 'cantidadVentas',v_ventas,'totalVentas',v_total,'totalDevoluciones',round(COALESCE(v_dev_total,0),2),
 'porMetodo',jsonb_build_object(
 'EFECTIVO',round(COALESCE(v_efectivo,0)-COALESCE(v_dev_efectivo,0),2),
 'TARJETA',round(COALESCE(v_tarjeta,0)-COALESCE(v_dev_tarjeta,0),2),
 'YAPE',round(COALESCE(v_yape,0)-COALESCE(v_dev_yape,0),2),
 'PLIN',round(COALESCE(v_plin,0)-COALESCE(v_dev_plin,0),2),
 'CREDITO',round(COALESCE(v_credito,0),2)),
 'efectivoEsperado',v_efectivo_esperado);
END; $fn$;
REVOKE ALL ON FUNCTION public.pos_caja_resumen_auth(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_caja_resumen_auth(integer) TO authenticated;
-- El historial lee caja_movimiento: la RPC de devolución ya registra allí cada reembolso.
CREATE OR REPLACE FUNCTION public.pos_caja_movimientos_listar_auth(p_caja_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_usuario integer; v_empresa integer; v_result jsonb;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 SELECT id,empresa_id INTO v_usuario,v_empresa FROM public.usuario WHERE auth_user_id=v_auth AND activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.caja c JOIN public.sucursal s ON s.id=c.sucursal_id AND s.empresa_id=v_empresa
 JOIN public.usuario_sucursal us ON us.sucursal_id=c.sucursal_id AND us.usuario_id=v_usuario
 WHERE c.id=p_caja_id AND c.usuario_id=v_usuario) THEN RAISE EXCEPTION 'Caja no encontrada o no autorizada' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',cm.id,'tipo',cm.tipo,'metodoPago',cm.metodo_pago,'monto',cm.monto,
   'motivo',cm.motivo,'createdAt',cm.created_at
  ) ORDER BY cm.created_at DESC,cm.id DESC),'[]'::jsonb)
  INTO v_result
  FROM (
   SELECT cm.id,cm.tipo,cm.metodo_pago,cm.monto,cm.motivo,cm.created_at
   FROM public.caja_movimiento cm
   WHERE cm.caja_id=p_caja_id AND cm.usuario_id=v_usuario
   ORDER BY cm.created_at DESC,cm.id DESC
   LIMIT 100
  ) cm;
 RETURN v_result;
END; $fn$;
REVOKE ALL ON FUNCTION public.pos_caja_movimientos_listar_auth(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_caja_movimientos_listar_auth(integer) TO authenticated;
COMMIT;
