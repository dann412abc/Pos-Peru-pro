-- PREVIEW ONLY. Ciclo de caja Supabase; instalar primero en staging.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_caja_abrir_auth(p_sucursal_id integer,p_saldo_inicial numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_usuario integer; v_empresa integer; v_id integer; v_fecha timestamptz;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 IF p_sucursal_id IS NULL OR p_sucursal_id<=0 OR p_saldo_inicial IS NULL OR p_saldo_inicial<0 OR p_saldo_inicial<>round(p_saldo_inicial,2) THEN
  RAISE EXCEPTION 'CASH_OPEN_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT id,empresa_id INTO v_usuario,v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sucursal s JOIN public.usuario_sucursal us ON us.sucursal_id=s.id WHERE s.id=p_sucursal_id AND s.empresa_id=v_empresa AND us.usuario_id=v_usuario) THEN
  RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.caja(sucursal_id,usuario_id,saldo_inicial,estado)
 VALUES(p_sucursal_id,v_usuario,p_saldo_inicial,'ABIERTA')
 RETURNING id,fecha_apertura INTO v_id,v_fecha;
 RETURN jsonb_build_object('id',v_id,'sucursalId',p_sucursal_id,'saldoInicial',p_saldo_inicial,'fechaApertura',v_fecha,'estado','ABIERTA');
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'CASH_ALREADY_OPEN' USING ERRCODE='23505';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.pos_caja_movimiento_auth(p_caja_id integer,p_tipo text,p_metodo text,p_monto numeric,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_usuario integer; v_empresa integer; v_estado text; v_disponible numeric(12,2); v_id integer;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 IF p_caja_id IS NULL OR p_caja_id<=0 OR p_tipo NOT IN ('INGRESO','SALIDA') OR p_metodo NOT IN ('EFECTIVO','TARJETA','YAPE','PLIN')
    OR p_monto IS NULL OR p_monto<=0 OR p_monto<>round(p_monto,2) OR length(trim(COALESCE(p_motivo,'')))<5 OR length(p_motivo)>200 THEN
  RAISE EXCEPTION 'CASH_MOVEMENT_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT id,empresa_id INTO v_usuario,v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 SELECT c.estado INTO v_estado FROM public.caja c JOIN public.sucursal s ON s.id=c.sucursal_id
 JOIN public.usuario_sucursal us ON us.sucursal_id=c.sucursal_id AND us.usuario_id=v_usuario
 WHERE c.id=p_caja_id AND c.usuario_id=v_usuario AND s.empresa_id=v_empresa FOR UPDATE OF c;
 IF NOT FOUND OR v_estado<>'ABIERTA' THEN RAISE EXCEPTION 'CASH_NOT_OPEN_OR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_tipo='SALIDA' AND p_metodo='EFECTIVO' THEN
  SELECT round(c.saldo_inicial + COALESCE((
    SELECT SUM(cobro.monto) FROM (
      SELECT cp.metodo_pago,cp.monto FROM public.comprobante_pago cp
      JOIN public.comprobante co ON co.id=cp.comprobante_id
      WHERE co.caja_id=c.id AND co.empresa_id=v_empresa AND co.estado<>'ANULADA'
      UNION ALL
      SELECT co.metodo_pago,co.total FROM public.comprobante co
      WHERE co.caja_id=c.id AND co.empresa_id=v_empresa AND co.estado<>'ANULADA'
        AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=co.id)
    ) cobro WHERE cobro.metodo_pago='EFECTIVO'
  ),0) + COALESCE((
    SELECT SUM(CASE WHEN cm.tipo='INGRESO' THEN cm.monto ELSE -cm.monto END)
    FROM public.caja_movimiento cm WHERE cm.caja_id=c.id AND cm.usuario_id=v_usuario AND cm.metodo_pago='EFECTIVO' AND cm.devolucion_venta_id IS NULL
  ),0) - COALESCE((
    SELECT SUM(dp.monto) FROM public.devolucion_venta_pago dp
    JOIN public.devolucion_venta d ON d.id=dp.devolucion_id AND d.empresa_id=dp.empresa_id
    WHERE d.caja_id=c.id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA' AND dp.metodo_pago='EFECTIVO'
  ),0),2) INTO v_disponible FROM public.caja c WHERE c.id=p_caja_id AND c.usuario_id=v_usuario;
  IF p_monto>v_disponible THEN RAISE EXCEPTION 'CASH_INSUFFICIENT_FUNDS' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.caja_movimiento(caja_id,usuario_id,tipo,metodo_pago,monto,motivo)
 VALUES(p_caja_id,v_usuario,p_tipo,p_metodo,p_monto,trim(p_motivo)) RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'id',v_id,'cajaId',p_caja_id,'tipo',p_tipo,'metodoPago',p_metodo,'monto',p_monto,'motivo',trim(p_motivo));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.pos_caja_cerrar_auth(p_caja_id integer,p_efectivo_contado numeric,p_arqueo jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_usuario integer; v_empresa integer; v_caja public.caja%ROWTYPE;
 v_efectivo numeric(12,2); v_tarjeta numeric(12,2); v_yape numeric(12,2); v_plin numeric(12,2); v_credito numeric(12,2);
 v_mov_efectivo numeric(12,2); v_mov_tarjeta numeric(12,2); v_mov_yape numeric(12,2); v_mov_plin numeric(12,2);
 v_dev_efectivo numeric(12,2); v_dev_tarjeta numeric(12,2); v_dev_yape numeric(12,2); v_dev_plin numeric(12,2); v_esperado numeric(12,2); v_diferencia numeric(12,2); v_esperado_metodos jsonb;
 v_linea jsonb; v_metodo text; v_contado numeric(12,2); v_arqueo_final jsonb:='[]'::jsonb;
BEGIN
 IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
 IF p_caja_id IS NULL OR p_caja_id<=0 OR p_efectivo_contado IS NULL OR p_efectivo_contado<0 OR p_efectivo_contado<>round(p_efectivo_contado,2)
    OR jsonb_typeof(p_arqueo)<>'array' THEN RAISE EXCEPTION 'CASH_CLOSE_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT id,empresa_id INTO v_usuario,v_empresa FROM public.usuario WHERE supabase_auth_user_id=v_auth AND activo=true;
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
 SELECT c.* INTO v_caja FROM public.caja c JOIN public.sucursal s ON s.id=c.sucursal_id
 JOIN public.usuario_sucursal us ON us.sucursal_id=c.sucursal_id AND us.usuario_id=v_usuario
 WHERE c.id=p_caja_id AND c.usuario_id=v_usuario AND s.empresa_id=v_empresa FOR UPDATE OF c;
 IF NOT FOUND OR v_caja.estado<>'ABIERTA' THEN RAISE EXCEPTION 'CASH_NOT_OPEN_OR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT
  COALESCE(SUM(monto) FILTER(WHERE metodo='EFECTIVO'),0),
  COALESCE(SUM(monto) FILTER(WHERE metodo='TARJETA'),0),
  COALESCE(SUM(monto) FILTER(WHERE metodo='YAPE'),0),
  COALESCE(SUM(monto) FILTER(WHERE metodo='PLIN'),0),
  COALESCE(SUM(monto) FILTER(WHERE metodo='CREDITO'),0)
 INTO v_efectivo,v_tarjeta,v_yape,v_plin,v_credito
 FROM (
  SELECT cp.metodo_pago metodo,cp.monto FROM public.comprobante_pago cp JOIN public.comprobante co ON co.id=cp.comprobante_id
  WHERE co.caja_id=p_caja_id AND co.empresa_id=v_empresa AND co.estado<>'ANULADA'
  UNION ALL
  SELECT co.metodo_pago,co.total FROM public.comprobante co
  WHERE co.caja_id=p_caja_id AND co.empresa_id=v_empresa AND co.estado<>'ANULADA'
   AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=co.id)
 ) p;
 SELECT
  COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END) FILTER(WHERE metodo_pago='EFECTIVO'),0),
  COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END) FILTER(WHERE metodo_pago='TARJETA'),0),
  COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END) FILTER(WHERE metodo_pago='YAPE'),0),
  COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END) FILTER(WHERE metodo_pago='PLIN'),0)
 INTO v_mov_efectivo,v_mov_tarjeta,v_mov_yape,v_mov_plin
 FROM public.caja_movimiento WHERE caja_id=p_caja_id AND devolucion_venta_id IS NULL;
 -- Los reembolsos se guardan en devolucion_venta_pago, no en caja_movimiento.
 SELECT
  COALESCE(SUM(dp.monto) FILTER(WHERE dp.metodo_pago='EFECTIVO'),0),
  COALESCE(SUM(dp.monto) FILTER(WHERE dp.metodo_pago='TARJETA'),0),
  COALESCE(SUM(dp.monto) FILTER(WHERE dp.metodo_pago='YAPE'),0),
  COALESCE(SUM(dp.monto) FILTER(WHERE dp.metodo_pago='PLIN'),0)
 INTO v_dev_efectivo,v_dev_tarjeta,v_dev_yape,v_dev_plin
 FROM public.devolucion_venta_pago dp
 JOIN public.devolucion_venta d ON d.id=dp.devolucion_id AND d.empresa_id=dp.empresa_id
 WHERE d.caja_id=p_caja_id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA';
 v_esperado:=round(COALESCE(v_caja.saldo_inicial,0)+v_efectivo+v_mov_efectivo-COALESCE(v_dev_efectivo,0),2);
 v_diferencia:=round(p_efectivo_contado-v_esperado,2);
 v_esperado_metodos:=jsonb_build_object(
  'EFECTIVO',v_esperado,
  'TARJETA',round(v_tarjeta+v_mov_tarjeta-COALESCE(v_dev_tarjeta,0),2),
  'YAPE',round(v_yape+v_mov_yape-COALESCE(v_dev_yape,0),2),
  'PLIN',round(v_plin+v_mov_plin-COALESCE(v_dev_plin,0),2),
  'CREDITO',v_credito
 );
 FOREACH v_metodo IN ARRAY ARRAY['EFECTIVO','TARJETA','YAPE','PLIN'] LOOP
  v_contado:=CASE WHEN v_metodo='EFECTIVO' THEN p_efectivo_contado ELSE COALESCE(
    (SELECT (x->>'montoContado')::numeric FROM jsonb_array_elements(p_arqueo) x WHERE x->>'metodoPago'=v_metodo LIMIT 1),
    (v_esperado_metodos->>v_metodo)::numeric) END;
  IF v_contado<0 OR v_contado<>round(v_contado,2) THEN RAISE EXCEPTION 'CASH_CLOSE_COUNT_INVALID' USING ERRCODE='22023'; END IF;
  v_arqueo_final:=v_arqueo_final||jsonb_build_array(jsonb_build_object('metodoPago',v_metodo,'montoEsperado',(v_esperado_metodos->>v_metodo)::numeric,'montoContado',v_contado,'diferencia',round(v_contado-(v_esperado_metodos->>v_metodo)::numeric,2)));
 END LOOP;
 UPDATE public.caja SET estado='CERRADA',fecha_cierre=now(),efectivo_contado=p_efectivo_contado,diferencia=v_diferencia,arqueo=v_arqueo_final WHERE id=p_caja_id;
 RETURN jsonb_build_object('ok',true,'id',p_caja_id,'estado','CERRADA','efectivoEsperado',v_esperado,'efectivoContado',p_efectivo_contado,'diferencia',v_diferencia,'arqueo',v_arqueo_final);
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_caja_abrir_auth(integer,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_caja_movimiento_auth(integer,text,text,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pos_caja_cerrar_auth(integer,numeric,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_caja_abrir_auth(integer,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_caja_movimiento_auth(integer,text,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_caja_cerrar_auth(integer,numeric,jsonb) TO authenticated;
COMMIT;
