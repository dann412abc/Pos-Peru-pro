-- v1.44.49 | ESCRITURA DE DOCUMENTO, PAGOS, INVENTARIO Y LOTES FEFO (INTERNO).
-- PREVIEW ONLY. Esta función SOLO puede ser llamada desde una RPC SECURITY DEFINER
-- futura RPC autenticada que construya el contexto confiable y confirme la transacción.
-- No conceder EXECUTE a PUBLIC, anon ni authenticated. No es una RPC pública.
-- Si cualquier paso posterior falla, PostgreSQL revierte también estos INSERT/UPDATE.

CREATE OR REPLACE FUNCTION public.pos_venta_insertar_documento_pagos_interno(
  p_context jsonb,
  p_payload jsonb,
  p_preflight jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_empresa_id integer;
  v_sucursal_id integer;
  v_usuario_id integer;
  v_caja_id integer;
  v_cliente_id integer;
  v_tipo text;
  v_serie text;
  v_correlativo integer;
  v_idempotency_key text;
  v_request_hash text;
  v_total numeric(12,2);
  v_descuento_global numeric(12,2);
  v_metodo_principal text;
  v_estado text;
  v_efectivo jsonb;
  v_comprobante_id integer;
  v_linea jsonb;
  v_calc_linea jsonb;
  v_producto_id integer;
  v_variante_id integer;
  v_numero_linea integer := 0;
  v_cantidad numeric(12,3);
  v_precio numeric(12,2);
  v_descuento numeric(12,2);
  v_tipo_igv integer;
  v_costo numeric(12,4);
  v_variante_nombre text;
  v_variante_codigo text;
  v_inserted integer := 0;
  v_payment jsonb;
  v_payment_count integer := 0;
  v_op_gravadas numeric(12,2);
  v_op_exoneradas numeric(12,2);
  v_op_inafectas numeric(12,2);
  v_total_igv numeric(12,2);
  v_vuelto numeric(12,2);
  v_monto_recibido numeric(12,2);
  v_item record;
  v_lote record;
  v_stock_anterior numeric(12,3);
  v_stock_posterior numeric(12,3);
  v_restante numeric(12,3);
  v_asignada numeric(12,3);
  v_inventario_movimientos integer := 0;
  v_lotes_asignados integer := 0;
  v_caja_estado text;
  v_caja_sucursal integer;
  v_caja_usuario integer;
  v_limite_credito numeric(12,2);
  v_cliente_numero text;
  v_saldo_credito numeric(12,2);
  v_monto_credito numeric(12,2) := 0;
  v_fecha_vencimiento date;
  v_cuenta_cobrar_id bigint;
  v_pagos_no_credito numeric(12,2) := 0;
BEGIN
  IF p_context IS NULL OR jsonb_typeof(p_context) <> 'object'
     OR COALESCE((p_context->>'contextValidated')::boolean, false) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'SALE_INTERNAL_CONTEXT_NOT_VALIDATED' USING ERRCODE = '42501';
  END IF;
  IF p_preflight IS NULL OR jsonb_typeof(p_preflight) <> 'object'
     OR COALESCE((p_preflight->>'ok')::boolean, false) IS DISTINCT FROM TRUE
     OR p_preflight->>'decision' IS DISTINCT FROM 'READY_FOR_TRANSACTIONAL_SALE' THEN
    RAISE EXCEPTION 'SALE_PREFLIGHT_NOT_READY_FOR_INSERT' USING ERRCODE = '22023';
  END IF;

  v_empresa_id := (p_context->>'empresaId')::integer;
  v_sucursal_id := (p_context->>'sucursalId')::integer;
  v_usuario_id := (p_context->>'usuarioId')::integer;
  v_caja_id := (p_context->>'cajaId')::integer;
  v_cliente_id := (p_preflight->'catalogo'->'cliente'->>'id')::integer;
  v_tipo := p_payload->>'tipo';
  v_idempotency_key := p_payload->>'idempotencyKey';
  v_descuento_global := round(COALESCE((p_payload->>'descuentoGlobal')::numeric, 0), 2);

  IF v_empresa_id IS NULL OR v_sucursal_id IS NULL OR v_usuario_id IS NULL
     OR v_caja_id IS NULL OR v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'SALE_INTERNAL_SCOPE_INCOMPLETE' USING ERRCODE = '22023';
  END IF;
  IF v_tipo NOT IN ('01','03') THEN
    RAISE EXCEPTION 'SALE_DOCUMENT_TYPE_NOT_SUPPORTED_BY_WRITER' USING ERRCODE = '22023';
  END IF;
  IF v_idempotency_key IS NULL OR length(v_idempotency_key) < 8 OR length(v_idempotency_key) > 100 THEN
    RAISE EXCEPTION 'SALE_IDEMPOTENCY_KEY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_descuento_global > 0 THEN
    RAISE EXCEPTION 'SALE_GLOBAL_DISCOUNT_NOT_SUPPORTED_BY_CURRENT_LINE_SCHEMA' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload->'lineas') AS x(value)
      WHERE COALESCE(NULLIF(x.value->>'descuento','')::numeric,0) > 0
    ) OR v_descuento_global > 0 THEN
    IF upper(COALESCE(p_context->>'rol','')) <> 'ADMIN' THEN
      RAISE EXCEPTION 'SALE_DISCOUNT_ADMIN_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF length(trim(COALESCE(p_payload->>'motivoDescuento',''))) < 5
       OR length(trim(COALESCE(p_payload->>'motivoDescuento',''))) > 250 THEN
      RAISE EXCEPTION 'SALE_DISCOUNT_REASON_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSIF NULLIF(trim(COALESCE(p_payload->>'motivoDescuento','')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'SALE_DISCOUNT_REASON_WITHOUT_DISCOUNT' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload->'lineas') <> 'array'
     OR jsonb_array_length(p_payload->'lineas') < 1
     OR jsonb_array_length(p_payload->'lineas') > 100
     OR jsonb_typeof(p_preflight->'calculo'->'lineas') <> 'array'
     OR jsonb_array_length(p_preflight->'calculo'->'lineas') <> jsonb_array_length(p_payload->'lineas')
     OR jsonb_typeof(p_preflight->'validacionPagos'->'pagos') <> 'array' THEN
    RAISE EXCEPTION 'SALE_INSERT_PAYLOAD_SHAPE_INVALID' USING ERRCODE = '22023';
  END IF;

  v_request_hash := encode(
    sha256(convert_to((p_payload - 'idempotencyKey')::text, 'UTF8')),
    'hex'
  );

  -- Defensa adicional: idempotencia consultada de nuevo dentro de la misma transacción.
  PERFORM 1 FROM public.comprobante
   WHERE empresa_id = v_empresa_id AND idempotency_key = v_idempotency_key
     AND request_hash = v_request_hash;
  IF FOUND THEN
    SELECT id INTO v_comprobante_id FROM public.comprobante
     WHERE empresa_id = v_empresa_id AND idempotency_key = v_idempotency_key
       AND request_hash = v_request_hash;
    RETURN jsonb_build_object('ok', true, 'decision', 'RETURN_EXISTING',
      'comprobanteId', v_comprobante_id, 'documentAndPaymentsInserted', false);
  END IF;
  IF EXISTS (SELECT 1 FROM public.comprobante
      WHERE empresa_id = v_empresa_id AND idempotency_key = v_idempotency_key) THEN
    RAISE EXCEPTION 'SALE_IDEMPOTENCY_KEY_PAYLOAD_CONFLICT' USING ERRCODE = '23505';
  END IF;

  v_total := round((p_preflight->'calculo'->'totales'->>'total')::numeric, 2);
  v_op_gravadas := round((p_preflight->'calculo'->'totales'->>'opGravadas')::numeric, 2);
  v_op_exoneradas := round((p_preflight->'calculo'->'totales'->>'opExoneradas')::numeric, 2);
  v_op_inafectas := round((p_preflight->'calculo'->'totales'->>'opInafectas')::numeric, 2);
  v_total_igv := round((p_preflight->'calculo'->'totales'->>'totalIgv')::numeric, 2);
  v_metodo_principal := p_preflight->'validacionPagos'->'resumen'->>'metodoPrincipal';
  v_estado := p_preflight->'validacionPagos'->'resumen'->>'estadoComprobante';
  IF v_total IS NULL OR v_total <= 0 OR v_metodo_principal NOT IN ('EFECTIVO','TARJETA','YAPE','PLIN','CREDITO','MIXTO')
     OR v_estado NOT IN ('PAGADA','PENDIENTE') THEN
    RAISE EXCEPTION 'SALE_INSERT_TOTAL_OR_PAYMENT_SUMMARY_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Caja abierta: se bloquea durante toda la transacción y se valida su propietario
  -- y sucursal. No se acepta un cajaId distinto al resuelto por el contexto autenticado.
  SELECT c.estado, c.sucursal_id, c.usuario_id
    INTO v_caja_estado, v_caja_sucursal, v_caja_usuario
  FROM public.caja c
  INNER JOIN public.sucursal s ON s.id = c.sucursal_id
  WHERE c.id = v_caja_id
    AND c.sucursal_id = v_sucursal_id
    AND c.usuario_id = v_usuario_id
    AND s.empresa_id = v_empresa_id
  FOR UPDATE OF c;
  IF NOT FOUND OR v_caja_estado IS DISTINCT FROM 'ABIERTA'
     OR v_caja_sucursal <> v_sucursal_id OR v_caja_usuario <> v_usuario_id THEN
    RAISE EXCEPTION 'SALE_CASH_REGISTER_NOT_OPEN_OR_NOT_OWNED' USING ERRCODE = '42501';
  END IF;

  -- El crédito se recalcula desde los pagos ya validados y se contrasta contra
  -- el límite/saldo vigente del cliente bloqueado, no contra importes del navegador.
  SELECT COALESCE(SUM((p.value->>'monto')::numeric) FILTER (WHERE p.value->>'metodo' = 'CREDITO'), 0),
         COALESCE(SUM((p.value->>'monto')::numeric) FILTER (WHERE p.value->>'metodo' <> 'CREDITO'), 0)
    INTO v_monto_credito, v_pagos_no_credito
  FROM jsonb_array_elements(p_preflight->'validacionPagos'->'pagos') AS p(value);

  IF v_monto_credito < 0 OR v_pagos_no_credito < 0
     OR round(v_monto_credito + v_pagos_no_credito, 2) <> v_total THEN
    RAISE EXCEPTION 'SALE_PAYMENT_TOTAL_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF v_monto_credito > 0 THEN
    SELECT cl.limite_credito, cl.saldo_credito, cl.numero
      INTO v_limite_credito, v_saldo_credito, v_cliente_numero
    FROM public.cliente cl
    WHERE cl.id = v_cliente_id AND cl.empresa_id = v_empresa_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALE_CREDIT_CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    v_limite_credito := COALESCE(v_limite_credito, 0);
    v_saldo_credito := COALESCE(v_saldo_credito, 0);
    IF v_cliente_numero = '00000000' OR v_limite_credito <= 0
       OR v_monto_credito > GREATEST(0, v_limite_credito - v_saldo_credito) + 0.001 THEN
      RAISE EXCEPTION 'SALE_CREDIT_LIMIT_EXCEEDED' USING ERRCODE = 'P0001';
    END IF;
    v_fecha_vencimiento := COALESCE(
      NULLIF(p_payload->>'fechaVencimiento','')::date,
      (NOW() AT TIME ZONE 'America/Lima')::date + 30
    );
    IF v_fecha_vencimiento < (NOW() AT TIME ZONE 'America/Lima')::date THEN
      RAISE EXCEPTION 'SALE_CREDIT_DUE_DATE_IN_PAST' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Solo series fiscales ya definidas en el esquema actual. Nota de venta queda fuera.
  v_serie := CASE v_tipo WHEN '01' THEN 'F001' WHEN '03' THEN 'B001' END;
  UPDATE public.serie_correlativo
     SET ultimo_correlativo = ultimo_correlativo + 1
   WHERE sucursal_id = v_sucursal_id
     AND tipo_comprobante = v_tipo
     AND serie = v_serie
   RETURNING ultimo_correlativo INTO v_correlativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_SERIES_NOT_CONFIGURED: %', v_serie USING ERRCODE = 'P0001';
  END IF;

  -- Bloquear todos los saldos en orden determinista antes de insertar el comprobante.
  -- Esto evita que dos ventas con líneas en distinto orden formen ciclos de bloqueo.
  FOR v_item IN
    SELECT x."productoId" AS producto_id, x."varianteId" AS variante_id,
           SUM(x.cantidad)::numeric(12,3) AS cantidad
    FROM jsonb_to_recordset(p_payload->'lineas') AS x(
      "productoId" integer, "varianteId" integer, cantidad numeric
    )
    GROUP BY x."productoId", x."varianteId"
    ORDER BY x."productoId", x."varianteId" NULLS FIRST
  LOOP
    IF v_item.variante_id IS NULL THEN
      SELECT ps.stock INTO v_stock_anterior
      FROM public.producto_stock ps
      WHERE ps.empresa_id = v_empresa_id AND ps.sucursal_id = v_sucursal_id
        AND ps.producto_id = v_item.producto_id
      FOR UPDATE;
    ELSE
      SELECT pvs.stock INTO v_stock_anterior
      FROM public.producto_variante_stock pvs
      WHERE pvs.empresa_id = v_empresa_id AND pvs.sucursal_id = v_sucursal_id
        AND pvs.producto_id = v_item.producto_id AND pvs.variante_id = v_item.variante_id
      FOR UPDATE;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALE_STOCK_ROW_MISSING: product %, variant %',
        v_item.producto_id, v_item.variante_id USING ERRCODE = '55000';
    END IF;
    IF v_stock_anterior < v_item.cantidad THEN
      RAISE EXCEPTION 'SALE_STOCK_CHANGED_OR_INSUFFICIENT: product %, variant %, available %, requested %',
        v_item.producto_id, v_item.variante_id, v_stock_anterior, v_item.cantidad
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  SELECT value INTO v_efectivo
  FROM jsonb_array_elements(p_preflight->'validacionPagos'->'pagos')
  WHERE value->>'metodo' = 'EFECTIVO'
  LIMIT 1;
  v_monto_recibido := CASE WHEN v_efectivo IS NULL THEN NULL ELSE (v_efectivo->>'montoRecibido')::numeric END;
  v_vuelto := CASE WHEN v_efectivo IS NULL THEN NULL ELSE (v_efectivo->>'vuelto')::numeric END;

  INSERT INTO public.comprobante (
    empresa_id, sucursal_id, caja_id, usuario_id, cliente_id, tipo, serie, correlativo,
    op_gravadas, op_exoneradas, op_inafectas, descuento_global, motivo_descuento,
    total_igv, total, metodo_pago, monto_recibido, vuelto, estado,
    idempotency_key, request_hash
  ) VALUES (
    v_empresa_id, v_sucursal_id, v_caja_id, v_usuario_id, v_cliente_id, v_tipo, v_serie, v_correlativo,
    v_op_gravadas, v_op_exoneradas, v_op_inafectas, v_descuento_global,
    NULLIF(trim(COALESCE(p_payload->>'motivoDescuento','')), ''),
    v_total_igv, v_total, v_metodo_principal, v_monto_recibido, v_vuelto, v_estado,
    v_idempotency_key, v_request_hash
  ) RETURNING id INTO v_comprobante_id;

  -- Las líneas conservan el orden del carrito. El costo se lee del saldo real
  -- bloqueado por la prevalidación; nunca se acepta costo del navegador.
  FOR v_linea IN
    SELECT value FROM jsonb_array_elements(p_payload->'lineas') WITH ORDINALITY AS src(value, ord)
    ORDER BY ord
  LOOP
    v_numero_linea := v_numero_linea + 1;
    v_calc_linea := (p_preflight->'calculo'->'lineas')->(v_numero_linea - 1);
    v_producto_id := (v_linea->>'productoId')::integer;
    v_variante_id := NULLIF(v_linea->>'varianteId','')::integer;
    v_cantidad := (v_calc_linea->>'cantidad')::numeric;
    v_precio := (v_calc_linea->>'precioUnitario')::numeric;
    -- El esquema actual guarda descuento por línea y descuento global por cabecera.
    -- Se bloquea descuento global arriba para evitar contabilizarlo dos veces.
    v_descuento := round(COALESCE((v_calc_linea->>'descuentoLinea')::numeric,0), 2);
    v_tipo_igv := (v_calc_linea->>'tipoIgv')::integer;

    IF v_variante_id IS NULL THEN
      SELECT ps.costo_promedio INTO v_costo
      FROM public.producto_stock ps
      WHERE ps.empresa_id = v_empresa_id AND ps.sucursal_id = v_sucursal_id
        AND ps.producto_id = v_producto_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'SALE_COST_STOCK_ROW_MISSING: %', v_producto_id USING ERRCODE = '55000'; END IF;
      v_variante_nombre := NULL; v_variante_codigo := NULL;
    ELSE
      SELECT pvs.costo_promedio, pv.nombre, pv.codigo
        INTO v_costo, v_variante_nombre, v_variante_codigo
      FROM public.producto_variante_stock pvs
      JOIN public.producto_variante pv ON pv.id = pvs.variante_id
        AND pv.producto_id = pvs.producto_id AND pv.empresa_id = pvs.empresa_id
      WHERE pvs.empresa_id = v_empresa_id AND pvs.sucursal_id = v_sucursal_id
        AND pvs.producto_id = v_producto_id AND pvs.variante_id = v_variante_id
      FOR SHARE OF pv;
      IF NOT FOUND THEN RAISE EXCEPTION 'SALE_VARIANT_COST_STOCK_ROW_MISSING: %', v_variante_id USING ERRCODE = '55000'; END IF;
    END IF;

    INSERT INTO public.comprobante_linea (
      comprobante_id, empresa_id, numero_linea, producto_id, variante_id,
      variante_nombre, variante_codigo, cantidad, precio_unitario, descuento,
      costo_unitario, tipo_igv, base_imponible, igv, subtotal
    ) VALUES (
      v_comprobante_id, v_empresa_id, v_numero_linea, v_producto_id, v_variante_id,
      v_variante_nombre, v_variante_codigo, v_cantidad, v_precio, v_descuento,
      COALESCE(v_costo,0), v_tipo_igv,
      (v_calc_linea->>'baseImponible')::numeric,
      (v_calc_linea->>'igv')::numeric,
      (v_calc_linea->>'subtotal')::numeric
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  FOR v_payment IN
    SELECT value FROM jsonb_array_elements(p_preflight->'validacionPagos'->'pagos')
  LOOP
    INSERT INTO public.comprobante_pago (
      comprobante_id, metodo_pago, monto, monto_recibido, vuelto
    ) VALUES (
      v_comprobante_id,
      v_payment->>'metodo',
      (v_payment->>'monto')::numeric,
      NULLIF(v_payment->>'montoRecibido','')::numeric,
      NULLIF(v_payment->>'vuelto','')::numeric
    );
    v_payment_count := v_payment_count + 1;
  END LOOP;

  IF v_inserted <> jsonb_array_length(p_payload->'lineas')
     OR v_payment_count <> jsonb_array_length(p_preflight->'validacionPagos'->'pagos') THEN
    RAISE EXCEPTION 'SALE_DOCUMENT_PAYMENT_INSERT_COUNT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  -- Salida física consolidada por producto/variante. Nunca se toca producto_stock
  -- para una variante: cada tipo de existencia tiene su propio saldo.
  FOR v_item IN
    SELECT x."productoId" AS producto_id, x."varianteId" AS variante_id,
           SUM(x.cantidad)::numeric(12,3) AS cantidad
    FROM jsonb_to_recordset(p_payload->'lineas') AS x(
      "productoId" integer, "varianteId" integer, cantidad numeric
    )
    GROUP BY x."productoId", x."varianteId"
    ORDER BY x."productoId", x."varianteId" NULLS FIRST
  LOOP
    v_restante := v_item.cantidad;

    IF v_item.variante_id IS NULL THEN
      SELECT ps.stock INTO v_stock_anterior
      FROM public.producto_stock ps
      WHERE ps.empresa_id = v_empresa_id AND ps.sucursal_id = v_sucursal_id
        AND ps.producto_id = v_item.producto_id;
      IF NOT FOUND OR v_stock_anterior < v_item.cantidad THEN
        RAISE EXCEPTION 'SALE_BASE_STOCK_CHANGED: %', v_item.producto_id USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.producto_stock
         SET stock = stock - v_item.cantidad, updated_at = now()
       WHERE empresa_id = v_empresa_id AND sucursal_id = v_sucursal_id
         AND producto_id = v_item.producto_id AND stock >= v_item.cantidad
       RETURNING stock INTO v_stock_posterior;
    ELSE
      SELECT pvs.stock INTO v_stock_anterior
      FROM public.producto_variante_stock pvs
      WHERE pvs.empresa_id = v_empresa_id AND pvs.sucursal_id = v_sucursal_id
        AND pvs.producto_id = v_item.producto_id AND pvs.variante_id = v_item.variante_id;
      IF NOT FOUND OR v_stock_anterior < v_item.cantidad THEN
        RAISE EXCEPTION 'SALE_VARIANT_STOCK_CHANGED: %', v_item.variante_id USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.producto_variante_stock
         SET stock = stock - v_item.cantidad, updated_at = now()
       WHERE empresa_id = v_empresa_id AND sucursal_id = v_sucursal_id
         AND producto_id = v_item.producto_id AND variante_id = v_item.variante_id
         AND stock >= v_item.cantidad
       RETURNING stock INTO v_stock_posterior;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALE_STOCK_DECREMENT_FAILED' USING ERRCODE = 'P0001';
    END IF;

    -- FEFO: vencimiento más próximo primero; lotes sin fecha al final.
    -- Se excluyen lotes vencidos y no se mezclan variantes.
    FOR v_lote IN
      SELECT l.id, l.cantidad_disponible
      FROM public.inventario_lote l
      WHERE l.empresa_id = v_empresa_id
        AND l.sucursal_id = v_sucursal_id
        AND l.producto_id = v_item.producto_id
        AND l.variante_id IS NOT DISTINCT FROM v_item.variante_id
        AND l.cantidad_disponible > 0
        AND (l.fecha_vencimiento IS NULL OR l.fecha_vencimiento >= CURRENT_DATE)
      ORDER BY l.fecha_vencimiento ASC NULLS LAST, l.id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_restante <= 0;
      v_asignada := LEAST(v_restante, v_lote.cantidad_disponible);
      UPDATE public.inventario_lote
         SET cantidad_disponible = cantidad_disponible - v_asignada
       WHERE id = v_lote.id AND empresa_id = v_empresa_id
         AND sucursal_id = v_sucursal_id AND producto_id = v_item.producto_id
         AND variante_id IS NOT DISTINCT FROM v_item.variante_id
         AND cantidad_disponible >= v_asignada;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SALE_LOT_ALLOCATION_RACE: %', v_lote.id USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.comprobante_lote_salida (
        empresa_id, comprobante_id, lote_id, producto_id, variante_id, cantidad
      ) VALUES (
        v_empresa_id, v_comprobante_id, v_lote.id, v_item.producto_id,
        v_item.variante_id, v_asignada
      );
      v_restante := v_restante - v_asignada;
      v_lotes_asignados := v_lotes_asignados + 1;
    END LOOP;

    IF v_restante > 0 THEN
      RAISE EXCEPTION 'SALE_FEFO_LOTS_INSUFFICIENT_OR_EXPIRED: product %, variant %, missing %',
        v_item.producto_id, v_item.variante_id, v_restante USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.movimiento_inventario (
      empresa_id, sucursal_id, producto_id, comprobante_id, usuario_id,
      tipo, cantidad, motivo, stock_anterior, stock_posterior, variante_id
    ) VALUES (
      v_empresa_id, v_sucursal_id, v_item.producto_id, v_comprobante_id, v_usuario_id,
      'SALIDA', v_item.cantidad,
      left('VENTA ' || v_serie || '-' || v_correlativo::text, 200),
      v_stock_anterior, v_stock_posterior, v_item.variante_id
    );
    v_inventario_movimientos := v_inventario_movimientos + 1;
  END LOOP;

  -- Crear una única cuenta por el componente financiado. Los pagos no crédito
  -- quedan registrados en comprobante_pago y son la fuente del reporte de caja.
  -- No se crea caja_movimiento aquí: duplicaría los ingresos que Caja ya suma
  -- desde comprobante_pago. El vuelto tampoco se registra como ingreso.
  IF v_monto_credito > 0 THEN
    INSERT INTO public.cuenta_cobrar (
      empresa_id, sucursal_id, comprobante_id, cliente_id,
      total_credito, saldo_pendiente, fecha_vencimiento, estado
    ) VALUES (
      v_empresa_id, v_sucursal_id, v_comprobante_id, v_cliente_id,
      v_monto_credito, v_monto_credito, v_fecha_vencimiento, 'PENDIENTE'
    )
    RETURNING id INTO v_cuenta_cobrar_id;

    UPDATE public.cliente
       SET saldo_credito = COALESCE(saldo_credito, 0) + v_monto_credito
     WHERE id = v_cliente_id AND empresa_id = v_empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALE_CREDIT_BALANCE_UPDATE_FAILED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'decision', 'DOCUMENT_PAYMENTS_INVENTORY_CASH_CREDIT_COMPLETE_PENDING_RUNTIME_TEST',
    'comprobanteId', v_comprobante_id,
    'tipo', v_tipo,
    'serie', v_serie,
    'correlativo', v_correlativo,
    'lineasInsertadas', v_inserted,
    'pagosInsertados', v_payment_count,
    'total', v_total,
    'documentAndPaymentsInserted', true,
    'inventoryUpdated', true,
    'inventoryMovementsCreated', v_inventario_movimientos,
    'lotAllocationsCreated', v_lotes_asignados,
    'lotAllocationPolicy', 'FEFO_EXPIRY_ASC_NULLS_LAST',
    'cashRegisterLockedAndValidated', true,
    'cashIncomeSource', 'COMPROBANTE_PAGO',
    'cashMovementsCreated', 0,
    'cashMovementReason', 'Avoid duplicate counting: caja reports sum comprobante_pago',
    'cashPaidAmount', v_pagos_no_credito,
    'creditAmount', v_monto_credito,
    'receivableCreated', (v_cuenta_cobrar_id IS NOT NULL),
    'receivableId', v_cuenta_cobrar_id,
    'writerBlockVersion', 'PE-SALES-DOCUMENT-PAYMENT-WRITER-3'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_insertar_documento_pagos_interno(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_insertar_documento_pagos_interno(jsonb, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.pos_venta_insertar_documento_pagos_interno(jsonb, jsonb, jsonb) FROM authenticated;

COMMENT ON FUNCTION public.pos_venta_insertar_documento_pagos_interno(jsonb, jsonb, jsonb)
IS 'Helper interno no invocable por clientes. Inserta cabecera, líneas, pagos, saldos de inventario, asignaciones FEFO y movimientos de inventario dentro de la transacción llamadora; requiere invocación exclusiva desde wrapper autenticado; el COMMIT solo ocurre al finalizar toda la operación.';
