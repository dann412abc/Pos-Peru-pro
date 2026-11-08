-- v1.44.51 | ORQUESTADOR TRANSACCIONAL DE VENTA AUTENTICADO.
-- PREVIEW ONLY. Una sola llamada autenticada construye el contexto y los importes
-- desde datos del servidor, y ejecuta el escritor interno dentro de la misma transacción.

CREATE OR REPLACE FUNCTION public.pos_venta_crear_auth(p_payload jsonb)
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
  v_payment_validation jsonb;
  v_preflight jsonb;
  v_result jsonb;
  v_hash text;
  v_cliente_id integer;
  v_cliente_pago jsonb;
  v_line jsonb;
  v_catalog_line jsonb;
  v_calc_input jsonb := '[]'::jsonb;
  v_producto_id integer;
  v_variante_id integer;
  v_discount numeric(12,2);
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SALE_PAYLOAD_MUST_BE_OBJECT' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload->'lineas') < 1
     OR jsonb_array_length(p_payload->'lineas') > 100
     OR jsonb_typeof(p_payload->'pagos') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SALE_PAYLOAD_LINES_OR_PAYMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'tipo' NOT IN ('01','03') THEN
    RAISE EXCEPTION 'SALE_DOCUMENT_TYPE_NOT_SUPPORTED_BY_WRITER' USING ERRCODE = '22023';
  END IF;

  -- El descuento global sigue bloqueado por el escritor: la cabecera y el
  -- esquema actual de líneas todavía no permiten representarlo sin duplicarlo.
  BEGIN
    v_discount := round(COALESCE(NULLIF(p_payload->>'descuentoGlobal','')::numeric,0),2);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SALE_GLOBAL_DISCOUNT_INVALID' USING ERRCODE = '22023';
  END;
  IF v_discount <> 0 THEN
    RAISE EXCEPTION 'SALE_GLOBAL_DISCOUNT_NOT_SUPPORTED_BY_CURRENT_LINE_SCHEMA' USING ERRCODE = '22023';
  END IF;

  -- La identidad, empresa, sucursal, rol y caja se derivan de auth.uid().
  -- No se aceptan esos valores desde el payload del navegador.
  v_context := public.pos_venta_contexto_auth(p_payload);
  v_hash := encode(
    sha256(convert_to((p_payload - 'idempotencyKey')::text, 'UTF8')),
    'hex'
  );

  -- Serializa reintentos con la misma clave. Una repetición idéntica devuelve
  -- el comprobante existente sin repetir stock, caja ni cuenta por cobrar.
  v_idempotency := public.pos_venta_idempotencia_resolver_interna(
    (v_context->>'empresaId')::integer,
    p_payload->>'idempotencyKey',
    v_hash
  );
  IF COALESCE((v_idempotency->>'existente')::boolean,false) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'RETURN_EXISTING',
      'comprobanteId', (v_idempotency->>'comprobanteId')::integer,
      'tipo', v_idempotency->>'tipo',
      'serie', v_idempotency->>'serie',
      'correlativo', (v_idempotency->>'correlativo')::integer,
      'total', (v_idempotency->>'total')::numeric,
      'idempotentReplay', true
    );
  END IF;

  BEGIN
    v_cliente_id := NULLIF(p_payload->>'clienteId','')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SALE_CUSTOMER_ID_INVALID' USING ERRCODE = '22023';
  END;
  IF v_cliente_id IS NULL OR v_cliente_id <= 0 THEN
    RAISE EXCEPTION 'SALE_CUSTOMER_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Valida cliente, catálogo, variantes y stock. Los bloqueos adquiridos
  -- permanecen hasta terminar esta llamada transaccional.
  v_catalog := public.pos_venta_validar_cliente_catalogo_interno(
    (v_context->>'empresaId')::integer,
    (v_context->>'sucursalId')::integer,
    v_cliente_id,
    p_payload->'lineas'
  );

  -- Reconstruye las líneas originales con precio e IGV del catálogo servidor.
  -- El helper de catálogo consolida cantidades repetidas, por eso se busca
  -- cada combinación producto/variante y se conserva el detalle de entrada.
  FOR v_line IN
    SELECT value FROM jsonb_array_elements(p_payload->'lineas') WITH ORDINALITY AS src(value, ord)
    ORDER BY ord
  LOOP
    BEGIN
      v_producto_id := NULLIF(v_line->>'productoId','')::integer;
      v_variante_id := NULLIF(v_line->>'varianteId','')::integer;
      v_discount := round(COALESCE(NULLIF(v_line->>'descuento','')::numeric,0),2);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'SALE_LINE_NUMERIC_VALUE_INVALID' USING ERRCODE = '22023';
    END;

    SELECT value INTO v_catalog_line
    FROM jsonb_array_elements(v_catalog->'lineas')
    WHERE (value->>'productoId')::integer = v_producto_id
      AND NULLIF(value->>'varianteId','')::integer IS NOT DISTINCT FROM v_variante_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALE_CATALOG_LINE_NOT_RESOLVED' USING ERRCODE = '22023';
    END IF;

    v_calc_input := v_calc_input || jsonb_build_array(jsonb_build_object(
      'cantidad', v_line->'cantidad',
      'precioUnitario', v_catalog_line->'precioCatalogo',
      'descuento', v_discount,
      'tipoIgv', v_catalog_line->'tipoIgv'
    ));
  END LOOP;

  v_calculation := public.pos_venta_calcular_importes_interno(v_calc_input, 0);

  -- El perfil de crédito procede de la fila real de cliente, nunca del cliente
  -- enviado por el navegador. El escritor vuelve a bloquear y validar límite.
  SELECT jsonb_build_object(
    'numero', cl.numero,
    'limite_credito', cl.limite_credito,
    'saldo_credito', cl.saldo_credito
  )
  INTO v_cliente_pago
  FROM public.cliente cl
  WHERE cl.id = v_cliente_id
    AND cl.empresa_id = (v_context->>'empresaId')::integer;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_CUSTOMER_NOT_FOUND_IN_COMPANY' USING ERRCODE = '42501';
  END IF;

  v_payment_validation := public.pos_venta_validar_pagos_interno(
    p_payload->'pagos',
    (v_calculation->'totales'->>'total')::numeric,
    v_cliente_pago
  );

  v_preflight := jsonb_build_object(
    'ok', true,
    'decision', 'READY_FOR_TRANSACTIONAL_SALE',
    'catalogo', v_catalog,
    'calculo', v_calculation,
    'validacionPagos', v_payment_validation,
    'serverValidated', true
  );

  -- El helper inserta comprobante, pagos, FEFO, movimientos, caja y crédito.
  -- Cualquier excepción aborta toda la función y revierte todos esos cambios.
  v_result := public.pos_venta_insertar_documento_pagos_interno(
    v_context, p_payload, v_preflight
  );

  RETURN v_result || jsonb_build_object(
    'orchestratorVersion', 'PE-SALES-AUTH-ORCHESTRATOR-1',
    'idempotentReplay', false,
    'transactional', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_crear_auth(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_crear_auth(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_venta_crear_auth(jsonb) TO authenticated;

COMMENT ON FUNCTION public.pos_venta_crear_auth(jsonb)
IS 'RPC pública autenticada de creación transaccional de venta. Deriva identidad y alcance desde auth.uid(), calcula precios/IGV/pagos en servidor y llama al escritor interno. PREVIEW ONLY hasta pruebas runtime y revisión del esquema.';
