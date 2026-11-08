-- PREVIEW ONLY: validador puro de pagos para la futura RPC transaccional.
-- p_cliente debe construirse en servidor tras resolver y bloquear el cliente real.
-- No confía en identidad, límite ni saldo enviados por el navegador.

CREATE OR REPLACE FUNCTION public.pos_venta_validar_pagos_interno(
  p_pagos jsonb,
  p_total numeric,
  p_cliente jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item jsonb;
  v_count integer;
  v_metodo text;
  v_monto numeric(14,2);
  v_recibido numeric(14,2);
  v_vuelto numeric(14,2);
  v_total numeric(14,2);
  v_suma numeric(14,2) := 0;
  v_credito numeric(14,2) := 0;
  v_ingreso_caja numeric(14,2) := 0;
  v_efectivo_recibido numeric(14,2) := 0;
  v_vuelto_total numeric(14,2) := 0;
  v_limite numeric(14,2) := 0;
  v_saldo numeric(14,2) := 0;
  v_disponible numeric(14,2) := 0;
  v_numero_cliente text;
  v_seen text[] := ARRAY[]::text[];
  v_output jsonb := '[]'::jsonb;
  v_methods text[] := ARRAY[]::text[];
BEGIN
  IF p_pagos IS NULL OR jsonb_typeof(p_pagos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SALE_PAYMENTS_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(p_pagos);
  IF v_count < 1 OR v_count > 5 THEN
    RAISE EXCEPTION 'SALE_PAYMENTS_COUNT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'SALE_PAYMENT_TOTAL_INVALID' USING ERRCODE = '22023';
  END IF;
  v_total := round(p_total, 2);

  -- El objeto cliente es un resultado interno obtenido y bloqueado por la RPC,
  -- nunca se debe pasar directamente el objeto recibido del frontend.
  IF p_cliente IS NOT NULL THEN
    BEGIN
      v_limite := round(COALESCE(NULLIF(p_cliente->>'limite_credito', '')::numeric, 0), 2);
      v_saldo := round(COALESCE(NULLIF(p_cliente->>'saldo_credito', '')::numeric, 0), 2);
      v_numero_cliente := p_cliente->>'numero';
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'SALE_CREDIT_PROFILE_INVALID' USING ERRCODE = '22023';
    END;
    IF v_limite < 0 OR v_saldo < 0 THEN
      RAISE EXCEPTION 'SALE_CREDIT_PROFILE_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_pagos)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'SALE_PAYMENT_ITEM_INVALID' USING ERRCODE = '22023';
    END IF;

    v_metodo := upper(trim(COALESCE(v_item->>'metodo', '')));
    IF v_metodo NOT IN ('EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO') THEN
      RAISE EXCEPTION 'SALE_PAYMENT_METHOD_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_metodo = ANY(v_seen) THEN
      RAISE EXCEPTION 'SALE_PAYMENT_METHOD_DUPLICATED' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_metodo);
    v_methods := array_append(v_methods, v_metodo);

    BEGIN
      v_monto := round(NULLIF(v_item->>'monto', '')::numeric, 2);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'SALE_PAYMENT_AMOUNT_INVALID' USING ERRCODE = '22023';
    END;
    IF v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION 'SALE_PAYMENT_AMOUNT_INVALID' USING ERRCODE = '22023';
    END IF;

    v_recibido := v_monto;
    v_vuelto := 0;
    IF v_metodo = 'EFECTIVO' THEN
      IF v_item ? 'montoRecibido' AND v_item->'montoRecibido' <> 'null'::jsonb THEN
        BEGIN
          v_recibido := round(NULLIF(v_item->>'montoRecibido', '')::numeric, 2);
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'SALE_CASH_RECEIVED_INVALID' USING ERRCODE = '22023';
        END;
      END IF;
      IF v_recibido IS NULL OR v_recibido < v_monto THEN
        RAISE EXCEPTION 'SALE_CASH_RECEIVED_BELOW_AMOUNT' USING ERRCODE = '22023';
      END IF;
      v_vuelto := round(v_recibido - v_monto, 2);
      v_efectivo_recibido := round(v_efectivo_recibido + v_recibido, 2);
      v_vuelto_total := round(v_vuelto_total + v_vuelto, 2);
      v_ingreso_caja := round(v_ingreso_caja + v_monto, 2);
    ELSE
      IF v_item ? 'montoRecibido' AND v_item->'montoRecibido' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'SALE_RECEIVED_AMOUNT_ONLY_FOR_CASH' USING ERRCODE = '22023';
      END IF;
      IF v_metodo = 'CREDITO' THEN
        v_credito := round(v_credito + v_monto, 2);
      ELSE
        v_ingreso_caja := round(v_ingreso_caja + v_monto, 2);
      END IF;
    END IF;

    v_suma := round(v_suma + v_monto, 2);
    v_output := v_output || jsonb_build_array(jsonb_build_object(
      'metodo', v_metodo,
      'monto', v_monto,
      'montoRecibido', CASE WHEN v_metodo = 'EFECTIVO' THEN v_recibido ELSE NULL END,
      'vuelto', CASE WHEN v_metodo = 'EFECTIVO' THEN v_vuelto ELSE NULL END,
      'ingresaCaja', CASE WHEN v_metodo = 'CREDITO' THEN 0 ELSE v_monto END
    ));
  END LOOP;

  -- El total cobrado debe coincidir exactamente a dos decimales.
  -- No se acepta tolerancia de S/ 0.01: dejaría ventas subpagadas o sobrepagadas.
  IF v_suma <> v_total THEN
    RAISE EXCEPTION 'SALE_PAYMENT_SUM_MISMATCH' USING ERRCODE = '22023',
      DETAIL = format('payments=%s total=%s', v_suma, v_total);
  END IF;

  IF v_credito > 0 THEN
    IF p_cliente IS NULL OR COALESCE(v_numero_cliente, '') = '00000000' OR v_limite <= 0 THEN
      RAISE EXCEPTION 'SALE_CREDIT_NOT_AUTHORIZED' USING ERRCODE = '22023';
    END IF;
    v_disponible := greatest(0, round(v_limite - v_saldo, 2));
    IF v_credito > v_disponible + 0.001 THEN
      RAISE EXCEPTION 'SALE_CREDIT_LIMIT_EXCEEDED' USING ERRCODE = '22023',
        DETAIL = format('credit=%s available=%s', v_credito, v_disponible);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'pagos', v_output,
    'resumen', jsonb_build_object(
      'totalVenta', v_total,
      'totalPagado', v_suma,
      'totalCredito', v_credito,
      'ingresoCaja', v_ingreso_caja,
      'efectivoRecibido', v_efectivo_recibido,
      'vuelto', v_vuelto_total,
      'saldoPorCobrar', v_credito,
      'metodoPrincipal', CASE WHEN v_count = 1 THEN v_methods[1] ELSE 'MIXTO' END,
      'estadoComprobante', CASE WHEN v_credito > 0 THEN 'PENDIENTE' ELSE 'PAGADA' END
    ),
    'paymentValidationVersion', 'PE-PAYMENTS-CASH-MIXED-CREDIT-1'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_validar_pagos_interno(jsonb, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_validar_pagos_interno(jsonb, numeric, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.pos_venta_validar_pagos_interno(jsonb, numeric, jsonb) FROM authenticated;

COMMENT ON FUNCTION public.pos_venta_validar_pagos_interno(jsonb, numeric, jsonb)
IS 'Validador puro de pagos POS: efectivo, tarjeta, Yape, Plin, mixtos y crédito. El perfil crediticio debe ser obtenido y bloqueado por la RPC autenticada; no escribe tablas.';
