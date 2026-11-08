-- PREVIEW ONLY: calculadora monetaria pura para la futura RPC transaccional.
-- Los precios que recibe deben provenir del catálogo validado en servidor,
-- nunca directamente del navegador.

CREATE OR REPLACE FUNCTION public.pos_venta_calcular_importes_interno(
  p_lineas jsonb,
  p_descuento_global numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item jsonb;
  v_row record;
  v_count integer;
  v_qty numeric(14,3);
  v_price numeric(14,4);
  v_discount numeric(14,2);
  v_gross numeric(14,2);
  v_net numeric(14,2);
  v_tax_type integer;
  v_total_before_global numeric(14,2) := 0;
  v_discount_global numeric(14,2);
  v_discount_remaining numeric(14,2);
  v_discount_alloc numeric(14,2);
  v_after_global numeric(14,2);
  v_base numeric(14,2);
  v_igv numeric(14,2);
  v_subtotal numeric(14,2);
  v_discount_lines numeric(14,2) := 0;
  v_op_gravadas numeric(14,2) := 0;
  v_op_exoneradas numeric(14,2) := 0;
  v_op_inafectas numeric(14,2) := 0;
  v_total_igv numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_output jsonb := '[]'::jsonb;
  v_prepared jsonb := '[]'::jsonb;
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SALE_LINES_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(p_lineas);
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'SALE_LINES_COUNT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_descuento_global IS NULL OR p_descuento_global < 0 THEN
    RAISE EXCEPTION 'GLOBAL_DISCOUNT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_discount_global := round(p_descuento_global, 2);

  -- Primera pasada: validar y calcular importes netos de cada línea.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lineas)
  LOOP
    BEGIN
      v_qty := NULLIF(v_item->>'cantidad', '')::numeric;
      v_price := NULLIF(v_item->>'precioUnitario', '')::numeric;
      v_discount := round(COALESCE(NULLIF(v_item->>'descuento', '')::numeric, 0), 2);
      v_tax_type := NULLIF(v_item->>'tipoIgv', '')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'SALE_LINE_NUMERIC_VALUE_INVALID' USING ERRCODE = '22023';
    END;

    IF v_qty IS NULL OR v_qty <= 0 OR v_price IS NULL OR v_price < 0
       OR v_discount IS NULL OR v_discount < 0
       OR v_tax_type IS NULL OR v_tax_type NOT IN (10, 20, 30) THEN
      RAISE EXCEPTION 'SALE_LINE_VALUE_INVALID' USING ERRCODE = '22023';
    END IF;

    v_gross := round(v_qty * v_price, 2);
    IF v_discount > v_gross THEN
      RAISE EXCEPTION 'LINE_DISCOUNT_EXCEEDS_GROSS' USING ERRCODE = '22023';
    END IF;

    v_net := round(v_gross - v_discount, 2);
    v_total_before_global := round(v_total_before_global + v_net, 2);
    v_discount_lines := round(v_discount_lines + v_discount, 2);

    v_prepared := v_prepared || jsonb_build_array(jsonb_build_object(
      'cantidad', v_qty,
      'precioUnitario', v_price,
      'descuento', v_discount,
      'importeBruto', v_gross,
      'netoAntesDescuentoGlobal', v_net,
      'tipoIgv', v_tax_type
    ));
  END LOOP;

  IF v_discount_global > v_total_before_global THEN
    RAISE EXCEPTION 'GLOBAL_DISCOUNT_EXCEEDS_SALE' USING ERRCODE = '22023';
  END IF;

  v_discount_remaining := v_discount_global;

  -- Segunda pasada: distribuir descuento global proporcionalmente por línea.
  -- La última línea absorbe el residuo de centavos para conservar la suma exacta.
  FOR v_row IN
    SELECT value AS item, ordinality AS ord
    FROM jsonb_array_elements(v_prepared) WITH ORDINALITY
    ORDER BY ordinality
  LOOP
    v_net := (v_row.item->>'netoAntesDescuentoGlobal')::numeric;
    v_tax_type := (v_row.item->>'tipoIgv')::integer;

    IF v_discount_global = 0 OR v_total_before_global = 0 THEN
      v_discount_alloc := 0;
    ELSIF v_row.ord = v_count THEN
      v_discount_alloc := v_discount_remaining;
    ELSE
      v_discount_alloc := round(
        v_discount_global * v_net / v_total_before_global, 2
      );
    END IF;

    IF v_discount_alloc < 0 OR v_discount_alloc > v_net
       OR v_discount_alloc > v_discount_remaining THEN
      RAISE EXCEPTION 'GLOBAL_DISCOUNT_ALLOCATION_INVALID' USING ERRCODE = '22023';
    END IF;

    v_discount_remaining := round(v_discount_remaining - v_discount_alloc, 2);
    v_after_global := round(v_net - v_discount_alloc, 2);

    IF v_tax_type = 10 THEN
      v_base := round(v_after_global / 1.18, 2);
      v_igv := round(v_base * 0.18, 2);
      v_op_gravadas := round(v_op_gravadas + v_base, 2);
    ELSIF v_tax_type = 20 THEN
      v_base := v_after_global;
      v_igv := 0;
      v_op_exoneradas := round(v_op_exoneradas + v_base, 2);
    ELSE
      v_base := v_after_global;
      v_igv := 0;
      v_op_inafectas := round(v_op_inafectas + v_base, 2);
    END IF;

    v_subtotal := round(v_base + v_igv, 2);
    v_total_igv := round(v_total_igv + v_igv, 2);
    v_total := round(v_total + v_subtotal, 2);

    v_output := v_output || jsonb_build_array(jsonb_build_object(
      'cantidad', (v_row.item->>'cantidad')::numeric,
      'precioUnitario', (v_row.item->>'precioUnitario')::numeric,
      'tipoIgv', v_tax_type,
      'importeBruto', (v_row.item->>'importeBruto')::numeric,
      'descuentoLinea', (v_row.item->>'descuento')::numeric,
      'descuentoGlobalAsignado', v_discount_alloc,
      'baseImponible', v_base,
      'igv', v_igv,
      'subtotal', v_subtotal
    ));
  END LOOP;

  IF v_discount_remaining <> 0 THEN
    RAISE EXCEPTION 'GLOBAL_DISCOUNT_REMAINDER_NOT_ZERO' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'lineas', v_output,
    'totales', jsonb_build_object(
      'opGravadas', v_op_gravadas,
      'opExoneradas', v_op_exoneradas,
      'opInafectas', v_op_inafectas,
      'descuentoLineas', v_discount_lines,
      'descuentoGlobal', v_discount_global,
      'descuentoTotal', round(v_discount_lines + v_discount_global, 2),
      'totalIgv', v_total_igv,
      'total', v_total
    ),
    'calculationVersion', 'PE-IGV18-ROUND2-GLOBAL-PROPORCIONAL-1'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_calcular_importes_interno(jsonb, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_calcular_importes_interno(jsonb, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.pos_venta_calcular_importes_interno(jsonb, numeric) FROM authenticated;

COMMENT ON FUNCTION public.pos_venta_calcular_importes_interno(jsonb, numeric)
IS 'Calculadora pura de importes PEN e IGV 18%; helper interno para la futura RPC de venta. No consulta ni modifica tablas.';
