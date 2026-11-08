-- PREVIEW ONLY. Integra contexto auth + idempotencia + catalogo/stock + IGV + pagos.
-- NO crea comprobantes, pagos, cuentas por cobrar, movimientos ni consume correlativos.
-- La futura RPC transaccional debe repetir estas validaciones dentro de la misma
-- transaccion que efectue la venta; esta llamada independiente no reserva stock/caja.

CREATE OR REPLACE FUNCTION public.pos_venta_preparar_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_context jsonb;
  v_idempotency jsonb;
  v_catalog jsonb;
  v_calculation jsonb;
  v_payments jsonb;
  v_hash text;
  v_cliente_id integer;
  v_descuento_global numeric(14,2);
  v_lineas_calculo jsonb;
  v_lineas_count integer;
BEGIN
  v_context := public.pos_venta_contexto_auth(p_payload);

  v_hash := encode(
    sha256(convert_to((p_payload - 'idempotencyKey')::text, 'UTF8')),
    'hex'
  );

  v_idempotency := public.pos_venta_idempotencia_resolver_interna(
    (v_context->>'empresaId')::integer,
    p_payload->>'idempotencyKey',
    v_hash
  );

  IF COALESCE((v_idempotency->>'existente')::boolean, false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'RETURN_EXISTING',
      'context', v_context,
      'idempotencia', v_idempotency,
      'saleCreated', false
    );
  END IF;

  BEGIN
    v_cliente_id := NULLIF(p_payload->>'clienteId','')::integer;
    v_descuento_global := round(COALESCE(NULLIF(p_payload->>'descuentoGlobal','')::numeric, 0), 2);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SALE_HEADER_NUMERIC_VALUE_INVALID' USING ERRCODE = '22023';
  END;
  IF v_descuento_global IS NULL OR v_descuento_global < 0 THEN
    RAISE EXCEPTION 'GLOBAL_DISCOUNT_INVALID' USING ERRCODE = '22023';
  END IF;

  v_catalog := public.pos_venta_validar_cliente_catalogo_interno(
    (v_context->>'empresaId')::integer,
    (v_context->>'sucursalId')::integer,
    v_cliente_id,
    p_payload->'lineas'
  );

  -- Los importes y tipos IGV se reconstruyen desde el catalogo bloqueado.
  -- Del payload solo se conservan cantidad, ids y descuento solicitado.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'productoId', (src.item->>'productoId')::integer,
      'varianteId', NULLIF(src.item->>'varianteId','')::integer,
      'cantidad', (src.item->>'cantidad')::numeric,
      'precioUnitario', (cat.item->>'precioCatalogo')::numeric,
      'descuento', COALESCE(NULLIF(src.item->>'descuento','')::numeric, 0),
      'tipoIgv', (cat.item->>'tipoIgv')::integer
    ) ORDER BY src.ord), '[]'::jsonb), count(*)::integer
    INTO v_lineas_calculo, v_lineas_count
  FROM jsonb_array_elements(p_payload->'lineas') WITH ORDINALITY AS src(item, ord)
  JOIN LATERAL (
    SELECT value AS item
    FROM jsonb_array_elements(v_catalog->'lineas') AS catalog_line(value)
    WHERE (value->>'productoId')::integer = (src.item->>'productoId')::integer
      AND NULLIF(value->>'varianteId','')::integer IS NOT DISTINCT FROM NULLIF(src.item->>'varianteId','')::integer
    LIMIT 1
  ) AS cat ON TRUE;

  IF v_lineas_count IS DISTINCT FROM jsonb_array_length(p_payload->'lineas') THEN
    RAISE EXCEPTION 'SALE_CATALOG_LINE_MAPPING_FAILED' USING ERRCODE = '22023';
  END IF;

  v_calculation := public.pos_venta_calcular_importes_interno(
    v_lineas_calculo,
    v_descuento_global
  );

  -- Perfil crediticio derivado exclusivamente del registro de cliente leído
  -- por el helper interno; no se acepta p_cliente desde el navegador.
  v_payments := public.pos_venta_validar_pagos_interno(
    p_payload->'pagos',
    (v_calculation->'totales'->>'total')::numeric,
    jsonb_build_object(
      'numero', v_catalog->'cliente'->>'numeroDocumento',
      'limite_credito', v_catalog->'cliente'->>'limiteCredito',
      'saldo_credito', v_catalog->'cliente'->>'saldoCredito'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'decision', 'READY_FOR_TRANSACTIONAL_SALE',
    'context', v_context,
    'idempotencia', v_idempotency,
    'catalogo', v_catalog,
    'calculo', v_calculation,
    'validacionPagos', v_payments,
    'saleCreated', false,
    'stockReserved', false,
    'cashMovementCreated', false,
    'correlativoConsumed', false,
    'preflightVersion', 'PE-SALES-INTEGRATED-PREFLIGHT-1'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_preparar_auth(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_preparar_auth(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_venta_preparar_auth(jsonb) TO authenticated;

COMMENT ON FUNCTION public.pos_venta_preparar_auth(jsonb)
IS 'Prevalidacion autenticada integrada: contexto, idempotencia, catalogo/stock, IGV y pagos. No crea ventas ni reserva stock/caja.';
