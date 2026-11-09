-- PREVIEW ONLY: prevalidación transaccional de devoluciones de venta.
-- No registra devolución ni modifica caja, inventario o cuentas por cobrar.
-- Mantiene la escritura bloqueada hasta completar y probar el RPC de commit.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_devolucion_prevalidar_auth(p_comprobante_id integer, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid := auth.uid();
  v_usuario integer;
  v_empresa integer;
  v_sucursal integer;
  v_caja_id integer;
  v_caja_saldo numeric(14,2);
  v_total numeric(14,2) := 0;
  v_credito numeric(14,2) := 0;
  v_reembolso numeric(14,2) := 0;
  v_pago numeric(14,2) := 0;
  v_efectivo numeric(14,2) := 0;
  v_disponible_efectivo numeric(14,2) := 0;
  v_motivo text;
  v_key text;
  v_prev record;
  v_line jsonb;
  v_id integer;
  v_cantidad numeric(12,3);
  v_disponible numeric(12,3);
  v_importe numeric(12,2);
  v_original record;
  v_pagos jsonb;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT u.id,u.empresa_id INTO v_usuario,v_empresa
  FROM public.usuario u WHERE u.supabase_auth_user_id=v_auth AND u.activo=true;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;

  IF jsonb_typeof(p_payload)<>'object' OR jsonb_typeof(p_payload->'lineas')<>'array'
     OR jsonb_array_length(p_payload->'lineas') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Seleccione entre 1 y 100 líneas válidas' USING ERRCODE='22023';
  END IF;
  v_motivo:=left(btrim(COALESCE(p_payload->>'motivo','')),500);
  v_key:=NULLIF(btrim(p_payload->>'idempotencyKey'),'');
  IF length(v_motivo)<5 OR v_key IS NULL OR v_key !~ '^[A-Za-z0-9._:-]{8,100}$' THEN
    RAISE EXCEPTION 'Motivo o clave de operación inválidos' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lineas') x GROUP BY x->>'comprobanteLineaId' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'No repita líneas en la misma devolución' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('mi-carrito-pos:devolucion:'||v_empresa||':'||v_usuario||':'||v_key,0));
  SELECT id,request_hash INTO v_prev FROM public.devolucion_venta
  WHERE empresa_id=v_empresa AND usuario_id=v_usuario AND idempotency_key=v_key;
  IF FOUND THEN
    -- No se compara aquí el hash: el servicio legado usa SHA-256 sobre un
    -- objeto normalizado distinto. La clave existente se trata como conflicto
    -- hasta que el RPC de commit comparta exactamente el mismo canonizador.
    RAISE EXCEPTION 'La clave ya fue utilizada; consulte el historial antes de reintentar' USING ERRCODE='23505';
  END IF;

  SELECT c.sucursal_id,c.cliente_id,c.tipo,c.estado,c.caja_id
    INTO v_original
  FROM public.comprobante c
  WHERE c.id=p_comprobante_id AND c.empresa_id=v_empresa
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comprobante no encontrado' USING ERRCODE='P0002'; END IF;
  v_sucursal:=v_original.sucursal_id;
  IF NOT EXISTS(SELECT 1 FROM public.usuario_sucursal us
    JOIN public.sucursal s ON s.id=us.sucursal_id AND s.empresa_id=v_empresa
    WHERE us.usuario_id=v_usuario AND us.sucursal_id=v_sucursal) THEN
    RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501';
  END IF;
  IF v_original.tipo NOT IN ('01','03') OR v_original.estado='ANULADA' THEN
    RAISE EXCEPTION 'Solo se pueden devolver boletas o facturas vigentes' USING ERRCODE='22023';
  END IF;

  SELECT c.id,c.saldo_inicial INTO v_caja_id,v_caja_saldo
  FROM public.caja c WHERE c.sucursal_id=v_sucursal AND c.usuario_id=v_usuario AND c.estado='ABIERTA'
  FOR UPDATE;
  IF v_caja_id IS NULL THEN RAISE EXCEPTION 'Abra una caja en la sucursal de la venta' USING ERRCODE='22023'; END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
    v_id:=NULLIF(v_line->>'comprobanteLineaId','')::integer;
    v_cantidad:=NULLIF(v_line->>'cantidad','')::numeric;
    IF v_id IS NULL OR v_cantidad IS NULL OR v_cantidad<=0 OR round(v_cantidad,3)<>v_cantidad THEN
      RAISE EXCEPTION 'Línea o cantidad inválida' USING ERRCODE='22023';
    END IF;
    SELECT cl.id,cl.cantidad,cl.subtotal INTO v_original
    FROM public.comprobante_linea cl
    WHERE cl.id=v_id AND cl.comprobante_id=p_comprobante_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La línea no pertenece al comprobante' USING ERRCODE='22023'; END IF;
    SELECT GREATEST(0,v_original.cantidad-COALESCE(sum(dl.cantidad),0)) INTO v_disponible
    FROM public.devolucion_venta_linea dl JOIN public.devolucion_venta d ON d.id=dl.devolucion_id
    WHERE dl.comprobante_linea_id=v_id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA';
    IF v_cantidad>COALESCE(v_disponible,0)+0.0001 THEN
      RAISE EXCEPTION 'La cantidad solicitada supera la disponible de la línea %',v_id USING ERRCODE='22023';
    END IF;
    SELECT GREATEST(0,v_original.subtotal-COALESCE(sum(dl.monto),0)) INTO v_importe
    FROM public.devolucion_venta_linea dl JOIN public.devolucion_venta d ON d.id=dl.devolucion_id
    WHERE dl.comprobante_linea_id=v_id AND d.empresa_id=v_empresa AND d.estado='REGISTRADA';
    v_total:=v_total+LEAST(v_importe,round(v_original.subtotal*v_cantidad/v_original.cantidad,2));
  END LOOP;
  v_total:=round(v_total,2);
  IF v_total<=0 THEN RAISE EXCEPTION 'El importe a devolver debe ser mayor a cero' USING ERRCODE='22023'; END IF;

  SELECT COALESCE(sum(cp.monto),0) INTO v_credito FROM public.comprobante_pago cp
  WHERE cp.comprobante_id=p_comprobante_id AND cp.metodo_pago='CREDITO';
  IF v_credito>0 AND NOT EXISTS(SELECT 1 FROM public.cuenta_cobrar cc
    WHERE cc.comprobante_id=p_comprobante_id AND cc.empresa_id=v_empresa AND cc.sucursal_id=v_sucursal) THEN
    RAISE EXCEPTION 'La venta tiene crédito sin cuenta por cobrar asociada' USING ERRCODE='23514';
  END IF;
  SELECT LEAST(v_total,COALESCE(cc.saldo_pendiente,0)) INTO v_credito
  FROM (SELECT 1) q LEFT JOIN public.cuenta_cobrar cc
    ON cc.comprobante_id=p_comprobante_id AND cc.empresa_id=v_empresa AND cc.sucursal_id=v_sucursal;
  v_reembolso:=round(v_total-COALESCE(v_credito,0),2);

  v_pagos:=COALESCE(p_payload->'pagos','[]'::jsonb);
  IF jsonb_typeof(v_pagos)<>'array' THEN RAISE EXCEPTION 'Formato de pagos inválido' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_pagos) x
    WHERE COALESCE(x->>'metodoPago','') NOT IN ('EFECTIVO','TARJETA','YAPE','PLIN')
      OR COALESCE((x->>'monto')::numeric,0)<=0
      OR (x->>'metodoPago' IN ('YAPE','PLIN') AND length(btrim(COALESCE(x->>'referencia','')))=0)) THEN
    RAISE EXCEPTION 'Medio, monto o referencia de reembolso inválidos' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_pagos) x GROUP BY x->>'metodoPago' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Consolide los importes de un mismo medio de reembolso' USING ERRCODE='22023';
  END IF;
  SELECT round(COALESCE(sum((x->>'monto')::numeric),0),2),
         round(COALESCE(sum(CASE WHEN x->>'metodoPago'='EFECTIVO' THEN (x->>'monto')::numeric ELSE 0 END),0),2)
  INTO v_pago,v_efectivo FROM jsonb_array_elements(v_pagos) x;
  IF v_pago<>v_reembolso THEN RAISE EXCEPTION 'Los pagos deben sumar S/ %; el crédito se ajustará por S/ %',to_char(v_reembolso,'FM999999990.00'),to_char(v_credito,'FM999999990.00') USING ERRCODE='22023'; END IF;

  IF v_efectivo>0 THEN
    SELECT COALESCE(v_caja_saldo,0)
      +COALESCE((SELECT sum(cp.monto) FROM public.comprobante_pago cp JOIN public.comprobante c ON c.id=cp.comprobante_id WHERE c.caja_id=v_caja_id AND cp.metodo_pago='EFECTIVO'),0)
      +COALESCE((SELECT sum(c.total) FROM public.comprobante c WHERE c.caja_id=v_caja_id AND c.metodo_pago='EFECTIVO'
        AND NOT EXISTS(SELECT 1 FROM public.comprobante_pago cp WHERE cp.comprobante_id=c.id)),0)
      +COALESCE((SELECT sum(CASE WHEN cm.tipo='INGRESO' THEN cm.monto ELSE -cm.monto END) FROM public.caja_movimiento cm WHERE cm.caja_id=v_caja_id AND cm.metodo_pago='EFECTIVO'),0)
    INTO v_disponible_efectivo;
    IF v_efectivo>v_disponible_efectivo THEN
      RAISE EXCEPTION 'Efectivo disponible insuficiente: S/ %',to_char(v_disponible_efectivo,'FM999999990.00') USING ERRCODE='22023';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'duplicado',false,'comprobanteId',p_comprobante_id,
    'sucursalId',v_sucursal,'cajaId',v_caja_id,'totalDevolucion',v_total,
    'creditoRevertido',COALESCE(v_credito,0),'montoReembolsado',v_reembolso,
    'pagosValidados',v_pago,'efectivoDisponible',v_disponible_efectivo,
    'mensaje','Prevalidación correcta. No se ha registrado ni modificado ningún dato.');
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_devolucion_prevalidar_auth(integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_devolucion_prevalidar_auth(integer,jsonb) TO authenticated;
COMMIT;
