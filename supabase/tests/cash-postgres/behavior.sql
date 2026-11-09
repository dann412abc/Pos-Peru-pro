-- Pruebas funcionales básicas de caja y conciliación de devoluciones.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK.
BEGIN;
INSERT INTO public.usuario(id,empresa_id,auth_user_id,activo)
VALUES (101,501,'11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.sucursal(id,empresa_id) VALUES (201,501);
INSERT INTO public.usuario_sucursal(usuario_id,sucursal_id) VALUES (101,201);
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE opened jsonb; movement jsonb; summary jsonb; history jsonb; closed jsonb; v_caja_id integer;
BEGIN
  opened := public.pos_caja_abrir_auth(201,100.00);
  v_caja_id := (opened->>'id')::integer;
  IF opened->>'estado' <> 'ABIERTA' OR (opened->>'saldoInicial')::numeric <> 100.00 THEN
    RAISE EXCEPTION 'TEST_OPEN_FAILED: %', opened;
  END IF;

  BEGIN
    PERFORM public.pos_caja_abrir_auth(201,0.00);
    RAISE EXCEPTION 'TEST_DUPLICATE_OPEN_NOT_REJECTED';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%CASH_ALREADY_OPEN%' THEN RAISE; END IF;
  END;

  movement := public.pos_caja_movimiento_auth(v_caja_id,'INGRESO','EFECTIVO',20.00,'Ingreso de prueba');
  IF COALESCE((movement->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST_CASH_INCOME_FAILED: %', movement;
  END IF;
  movement := public.pos_caja_movimiento_auth(v_caja_id,'SALIDA','EFECTIVO',5.00,'Salida de prueba');
  IF COALESCE((movement->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST_CASH_OUT_FAILED: %', movement;
  END IF;

  -- Venta mixta: S/ 50 en efectivo y S/ 30 con tarjeta.
  INSERT INTO public.comprobante(empresa_id,sucursal_id,caja_id,usuario_id,total,metodo_pago,estado)
  VALUES (501,201,v_caja_id,101,80.00,'MIXTO','PAGADA');
  INSERT INTO public.comprobante_pago(comprobante_id,metodo_pago,monto)
  SELECT c.id,'EFECTIVO',50.00 FROM public.comprobante c
  WHERE c.caja_id=v_caja_id AND c.empresa_id=501 AND c.total=80.00;
  INSERT INTO public.comprobante_pago(comprobante_id,metodo_pago,monto)
  SELECT c.id,'TARJETA',30.00 FROM public.comprobante c
  WHERE c.caja_id=v_caja_id AND c.empresa_id=501 AND c.total=80.00;

  -- Devolución registrada: S/ 10 en efectivo y S/ 5 a tarjeta.
  INSERT INTO public.devolucion_venta(caja_id,empresa_id,estado,total_devolucion)
  VALUES (v_caja_id,501,'REGISTRADA',15.00);
  INSERT INTO public.devolucion_venta_pago(devolucion_id,empresa_id,sucursal_id,metodo_pago,monto)
  SELECT d.id,501,201,'EFECTIVO',10.00 FROM public.devolucion_venta d
  WHERE d.caja_id=v_caja_id AND d.empresa_id=501 AND d.total_devolucion=15.00;
  INSERT INTO public.devolucion_venta_pago(devolucion_id,empresa_id,sucursal_id,metodo_pago,monto)
  SELECT d.id,501,201,'TARJETA',5.00 FROM public.devolucion_venta d
  WHERE d.caja_id=v_caja_id AND d.empresa_id=501 AND d.total_devolucion=15.00;
  -- La RPC de devolución persiste también la salida de efectivo en caja_movimiento.
  INSERT INTO public.caja_movimiento(caja_id,usuario_id,tipo,metodo_pago,monto,motivo,devolucion_venta_id)
  SELECT v_caja_id,101,'SALIDA','EFECTIVO',10.00,'Reembolso de prueba',d.id
  FROM public.devolucion_venta d
  WHERE d.caja_id=v_caja_id AND d.empresa_id=501 AND d.total_devolucion=15.00;

  summary := public.pos_caja_resumen_auth(v_caja_id);
  IF (summary->>'efectivoEsperado')::numeric <> 155.00 THEN
    RAISE EXCEPTION 'TEST_REFUND_CASH_DOUBLE_COUNT_OR_MISSING: %', summary;
  END IF;
  IF (summary->>'totalDevoluciones')::numeric <> 15.00
     OR (summary->'porMetodo'->>'EFECTIVO')::numeric <> 40.00
     OR (summary->'porMetodo'->>'TARJETA')::numeric <> 25.00 THEN
    RAISE EXCEPTION 'TEST_REFUND_PAYMENT_RECONCILIATION_FAILED: %', summary;
  END IF;

  history := public.pos_caja_movimientos_listar_auth(v_caja_id);
  IF jsonb_array_length(history) <> 3 THEN
    RAISE EXCEPTION 'TEST_CASH_HISTORY_WITH_REFUND_FAILED: %', history;
  END IF;

  closed := public.pos_caja_cerrar_auth(v_caja_id,155.00,'[]'::jsonb);
  IF closed->>'estado' <> 'CERRADA' OR (closed->>'diferencia')::numeric <> 0.00 THEN
    RAISE EXCEPTION 'TEST_CASH_CLOSE_FAILED: %', closed;
  END;

  BEGIN
    PERFORM public.pos_caja_movimiento_auth(v_caja_id,'INGRESO','EFECTIVO',1.00,'Movimiento cerrado');
    RAISE EXCEPTION 'TEST_MOVEMENT_AFTER_CLOSE_NOT_REJECTED';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$test$;
ROLLBACK;
