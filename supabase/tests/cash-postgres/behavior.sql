-- Pruebas funcionales básicas de caja contra PostgreSQL efímero.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK.
BEGIN;
INSERT INTO public.usuario(id,empresa_id,auth_user_id,activo)
VALUES (101,501,'11111111-1111-4111-8111-111111111111',true);
INSERT INTO public.sucursal(id,empresa_id) VALUES (201,501);
INSERT INTO public.usuario_sucursal(usuario_id,sucursal_id) VALUES (101,201);
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE opened jsonb; movement jsonb; summary jsonb; history jsonb; closed jsonb; caja_id integer;
BEGIN
  opened := public.pos_caja_abrir_auth(201,100.00);
  caja_id := (opened->>'id')::integer;
  IF opened->>'estado' <> 'ABIERTA' OR (opened->>'saldoInicial')::numeric <> 100.00 THEN
    RAISE EXCEPTION 'TEST_OPEN_FAILED: %', opened;
  END IF;

  BEGIN
    PERFORM public.pos_caja_abrir_auth(201,0.00);
    RAISE EXCEPTION 'TEST_DUPLICATE_OPEN_NOT_REJECTED';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%CASH_ALREADY_OPEN%' THEN RAISE; END IF;
  END;

  movement := public.pos_caja_movimiento_auth(caja_id,'INGRESO','EFECTIVO',20.00,'Ingreso de prueba');
  IF COALESCE((movement->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST_CASH_INCOME_FAILED: %', movement;
  END IF;
  movement := public.pos_caja_movimiento_auth(caja_id,'SALIDA','EFECTIVO',5.00,'Salida de prueba');
  IF COALESCE((movement->>'ok')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST_CASH_OUT_FAILED: %', movement;
  END IF;

  summary := public.pos_caja_resumen_auth(caja_id);
  IF (summary->>'efectivoEsperado')::numeric <> 115.00 THEN
    RAISE EXCEPTION 'TEST_CASH_SUMMARY_FAILED: %', summary;
  END IF;

  history := public.pos_caja_movimientos_listar_auth(caja_id);
  IF jsonb_array_length(history) <> 2 THEN
    RAISE EXCEPTION 'TEST_CASH_HISTORY_FAILED: %', history;
  END IF;

  closed := public.pos_caja_cerrar_auth(caja_id,115.00,'[]'::jsonb);
  IF closed->>'estado' <> 'CERRADA' OR (closed->>'diferencia')::numeric <> 0.00 THEN
    RAISE EXCEPTION 'TEST_CASH_CLOSE_FAILED: %', closed;
  END IF;

  BEGIN
    PERFORM public.pos_caja_movimiento_auth(caja_id,'INGRESO','EFECTIVO',1.00,'Movimiento cerrado');
    RAISE EXCEPTION 'TEST_MOVEMENT_AFTER_CLOSE_NOT_REJECTED';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$test$;
ROLLBACK;
