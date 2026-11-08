-- v1.44.46 | BARRERA FAIL-CLOSED PARA LA FUTURA RPC DE ESCRITURA.
-- PREVIEW ONLY. No crea comprobantes, pagos, movimientos ni consume correlativos.
-- La RPC de escritura completa no se habilita hasta integrar inventario, FEFO,
-- crédito, caja, numeración y rollback en una única transacción.

CREATE OR REPLACE FUNCTION public.pos_venta_transaccion_guardia_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_preflight jsonb;
BEGIN
  -- Reutiliza el flujo autenticado completo. Todos los locks de caja, catálogo
  -- y stock viven en la transacción de esta llamada y se liberan al finalizar.
  v_preflight := public.pos_venta_preparar_auth(p_payload);

  IF COALESCE((v_preflight->>'ok')::boolean, false) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'SALE_PREFLIGHT_DID_NOT_SUCCEED' USING ERRCODE = 'P0001';
  END IF;

  -- Barrera intencional: NO hay escritura parcial. No convertir esta respuesta
  -- en éxito de venta ni habilitar el botón Cobrar desde el frontend.
  RETURN jsonb_build_object(
    'ok', false,
    'decision', 'WRITER_DISABLED',
    'code', 'SALE_TRANSACTIONAL_WRITER_NOT_READY',
    'preflight', v_preflight,
    'saleCreated', false,
    'paymentsCreated', false,
    'inventoryChanged', false,
    'cashMovementCreated', false,
    'receivableCreated', false,
    'correlativoConsumed', false,
    'transactionalWriterVersion', 'PE-SALES-TXN-GUARD-1'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_transaccion_guardia_auth(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_transaccion_guardia_auth(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_venta_transaccion_guardia_auth(jsonb) TO authenticated;

COMMENT ON FUNCTION public.pos_venta_transaccion_guardia_auth(jsonb)
IS 'Barrera autenticada fail-closed: ejecuta prevalidación integrada y rechaza la escritura hasta completar el escritor transaccional integral. No crea ventas.';
