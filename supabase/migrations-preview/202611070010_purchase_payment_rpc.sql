-- PREVIEW SOLAMENTE. Revisar esquema real y probar en staging antes de instalar.
-- Registra un pago parcial/total a proveedor con actualización atómica de saldo y caja.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compra_registrar_pago_auth(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid := auth.uid(); v_empresa integer; v_usuario integer;
  v_compra_id bigint; v_sucursal integer; v_monto numeric(12,2); v_metodo text;
  v_caja_id integer; v_referencia text; v_idem text; v_compra public.compra%ROWTYPE;
  v_caja public.caja%ROWTYPE; v_efectivo numeric(12,2); v_pagado numeric(12,2); v_saldo numeric(12,2);
  v_pago_id bigint;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT id,empresa_id INTO v_usuario,v_empresa FROM public.usuario
    WHERE supabase_auth_user_id=v_auth AND activo=true;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Datos de pago inválidos' USING ERRCODE='22023'; END IF;
  v_compra_id := NULLIF(p_payload->>'compraId','')::bigint;
  v_monto := round(NULLIF(p_payload->>'monto','')::numeric,2);
  v_metodo := upper(COALESCE(p_payload->>'metodoPago',''));
  v_caja_id := NULLIF(p_payload->>'cajaId','')::integer;
  v_referencia := NULLIF(left(btrim(COALESCE(p_payload->>'referencia','')),120),'');
  v_idem := NULLIF(p_payload->>'idempotencyKey','');
  IF v_compra_id IS NULL OR v_monto IS NULL OR v_monto<=0 OR v_monto>999999999
    OR v_metodo NOT IN ('EFECTIVO','YAPE','PLIN','TARJETA','TRANSFERENCIA')
    OR v_idem IS NULL OR v_idem !~ '^[A-Za-z0-9._:-]{12,100}$' THEN
    RAISE EXCEPTION 'Compra, importe, medio de pago o clave inválidos' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_compra FROM public.compra WHERE id=v_compra_id AND empresa_id=v_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra no encontrada' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuario_sucursal us WHERE us.usuario_id=v_usuario AND us.sucursal_id=v_compra.sucursal_id) THEN
    RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501';
  END IF;
  -- Un reintento con la misma clave devuelve el estado actual sin volver a descontar.
  SELECT id INTO v_pago_id FROM public.compra_pago WHERE empresa_id=v_empresa AND idempotency_key=v_idem;
  IF v_pago_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.compra_pago WHERE id=v_pago_id AND compra_id=v_compra_id) THEN
      RAISE EXCEPTION 'Clave de pago usada en otra compra' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('ok',true,'duplicado',true,'compraId',v_compra_id,'pagado',v_compra.pagado,'saldoPendiente',v_compra.saldo_pendiente,'pagoId',v_pago_id);
  END IF;
  IF v_compra.estado<>'RECIBIDA' THEN RAISE EXCEPTION 'No se puede pagar una compra anulada' USING ERRCODE='22023'; END IF;
  IF v_monto>v_compra.saldo_pendiente+0.001 THEN RAISE EXCEPTION 'El importe supera el saldo pendiente' USING ERRCODE='22023'; END IF;
  IF v_metodo='TRANSFERENCIA' AND v_caja_id IS NOT NULL THEN RAISE EXCEPTION 'La transferencia no se registra como movimiento de caja' USING ERRCODE='22023'; END IF;
  IF v_metodo<>'TRANSFERENCIA' AND v_caja_id IS NULL THEN RAISE EXCEPTION 'Selecciona una caja abierta para este medio de pago' USING ERRCODE='22023'; END IF;
  IF v_caja_id IS NOT NULL THEN
    SELECT c.* INTO v_caja FROM public.caja c JOIN public.sucursal s ON s.id=c.sucursal_id
      WHERE c.id=v_caja_id AND c.usuario_id=v_usuario AND c.sucursal_id=v_compra.sucursal_id
        AND c.estado='ABIERTA' AND s.empresa_id=v_empresa FOR UPDATE OF c;
    IF NOT FOUND THEN RAISE EXCEPTION 'La caja no está abierta o no pertenece al usuario/sucursal' USING ERRCODE='42501'; END IF;
    IF v_metodo='EFECTIVO' THEN
      SELECT COALESCE(sum(x.monto),0) INTO v_efectivo FROM (
        SELECT cp.monto FROM public.comprobante_pago cp JOIN public.comprobante c ON c.id=cp.comprobante_id WHERE c.caja_id=v_caja_id AND cp.metodo_pago='EFECTIVO'
        UNION ALL SELECT c.total FROM public.comprobante c WHERE c.caja_id=v_caja_id AND c.metodo_pago='EFECTIVO' AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=c.id)
        UNION ALL SELECT CASE WHEN cm.tipo='INGRESO' THEN cm.monto ELSE -cm.monto END FROM public.caja_movimiento cm WHERE cm.caja_id=v_caja_id AND cm.metodo_pago='EFECTIVO'
      ) x;
      IF v_monto>COALESCE(v_caja.saldo_inicial,0)+v_efectivo THEN RAISE EXCEPTION 'Efectivo insuficiente en caja' USING ERRCODE='22023'; END IF;
    END IF;
  END IF;
  INSERT INTO public.compra_pago(empresa_id,compra_id,usuario_id,caja_id,metodo_pago,monto,referencia,idempotency_key)
    VALUES(v_empresa,v_compra_id,v_usuario,v_caja_id,v_metodo,v_monto,v_referencia,v_idem) RETURNING id INTO v_pago_id;
  IF v_caja_id IS NOT NULL THEN
    INSERT INTO public.caja_movimiento(caja_id,usuario_id,tipo,metodo_pago,monto,motivo,compra_id)
      VALUES(v_caja_id,v_usuario,'SALIDA',v_metodo,v_monto,left('Pago a proveedor · compra #'||v_compra_id,200),v_compra_id);
  END IF;
  v_pagado:=round(v_compra.pagado+v_monto,2); v_saldo:=round(v_compra.total-v_pagado,2);
  UPDATE public.compra SET pagado=v_pagado,saldo_pendiente=greatest(v_saldo,0)
    WHERE id=v_compra_id AND empresa_id=v_empresa;
  RETURN jsonb_build_object('ok',true,'duplicado',false,'compraId',v_compra_id,'pagoId',v_pago_id,'pagado',v_pagado,'saldoPendiente',greatest(v_saldo,0));
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compra_registrar_pago_auth(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_compra_registrar_pago_auth(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_compra_registrar_pago_auth(jsonb) IS 'Pago parcial/total a proveedor: idempotencia, saldo y salida de caja atómicos.';
COMMIT;
