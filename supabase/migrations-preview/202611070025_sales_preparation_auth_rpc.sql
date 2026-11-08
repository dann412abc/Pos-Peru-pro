-- PREVIEW / SOLO VALIDACION. NO CREA VENTAS NI DESCUENTA INVENTARIO.
-- Funciones internas: invocar desde pos_venta_preparar_auth dentro de una transaccion.
-- Los bloqueos son de corta duración y no reservan stock tras terminar la llamada.

CREATE OR REPLACE FUNCTION public.pos_venta_validar_cliente_catalogo_interno(
  p_empresa_id integer,
  p_sucursal_id integer,
  p_cliente_id integer,
  p_lineas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_cliente record;
  v_item record;
  v_producto record;
  v_variante record;
  v_stock numeric(12,3);
  v_result jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  IF p_empresa_id IS NULL OR p_sucursal_id IS NULL OR p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_AND_SCOPE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_lineas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SALE_LINES_MUST_BE_ARRAY' USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(p_lineas);
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'SALE_LINES_COUNT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT cl.id, cl.empresa_id, cl.tipo_doc, cl.numero, cl.nombre,
         cl.limite_credito, cl.saldo_credito
    INTO v_cliente
  FROM public.cliente cl
  WHERE cl.id = p_cliente_id
    AND cl.empresa_id = p_empresa_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND_IN_COMPANY' USING ERRCODE = '42501';
  END IF;

  -- Consolidar líneas repetidas antes de bloquear stock, y fijar un orden
  -- determinista para reducir deadlocks entre ventas concurrentes.
  FOR v_item IN
    SELECT x."productoId" AS producto_id, x."varianteId" AS variante_id, SUM(x.cantidad)::numeric(12,3) AS cantidad
    FROM jsonb_to_recordset(p_lineas) AS x(
      "productoId" integer,
      "varianteId" integer,
      cantidad numeric
    )
    GROUP BY x."productoId", x."varianteId"
    ORDER BY x."productoId", x."varianteId" NULLS FIRST
  LOOP
    IF v_item.producto_id IS NULL OR v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
      RAISE EXCEPTION 'SALE_LINE_INVALID' USING ERRCODE = '22023';
    END IF;

    SELECT p.id, p.empresa_id, p.nombre, p.unidad, p.precio,
           p.tipo_igv, p.activo, p.tiene_variantes
      INTO v_producto
    FROM public.producto p
    WHERE p.id = v_item.producto_id
      AND p.empresa_id = p_empresa_id
    FOR SHARE;

    IF NOT FOUND OR v_producto.activo IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_INACTIVE: %', v_item.producto_id
        USING ERRCODE = '42501';
    END IF;

    IF v_item.variante_id IS NULL THEN
      IF v_producto.tiene_variantes THEN
        RAISE EXCEPTION 'PRODUCT_REQUIRES_VARIANT: %', v_item.producto_id
          USING ERRCODE = '22023';
      END IF;

      SELECT ps.stock INTO v_stock
      FROM public.producto_stock ps
      WHERE ps.producto_id = v_item.producto_id
        AND ps.sucursal_id = p_sucursal_id
        AND ps.empresa_id = p_empresa_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_STOCK_ROW_NOT_FOUND: %', v_item.producto_id
          USING ERRCODE = '55000';
      END IF;

      IF v_stock < v_item.cantidad THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: product %, available %, requested %',
          v_item.producto_id, v_stock, v_item.cantidad
          USING ERRCODE = 'P0001';
      END IF;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'productoId', v_producto.id,
        'varianteId', NULL,
        'nombre', v_producto.nombre,
        'unidad', v_producto.unidad,
        'cantidad', v_item.cantidad,
        'precioCatalogo', v_producto.precio,
        'tipoIgv', v_producto.tipo_igv,
        'stockDisponible', v_stock
      ));
    ELSE
      IF NOT v_producto.tiene_variantes THEN
        RAISE EXCEPTION 'PRODUCT_DOES_NOT_USE_VARIANTS: %', v_item.producto_id
          USING ERRCODE = '22023';
      END IF;

      SELECT pv.id, pv.producto_id, pv.empresa_id, pv.codigo, pv.nombre,
             pv.precio, pv.activo
        INTO v_variante
      FROM public.producto_variante pv
      WHERE pv.id = v_item.variante_id
        AND pv.producto_id = v_item.producto_id
        AND pv.empresa_id = p_empresa_id
      FOR SHARE;

      IF NOT FOUND OR v_variante.activo IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'VARIANT_NOT_FOUND_OR_INACTIVE: %', v_item.variante_id
          USING ERRCODE = '42501';
      END IF;

      SELECT vs.stock INTO v_stock
      FROM public.producto_variante_stock vs
      WHERE vs.variante_id = v_item.variante_id
        AND vs.producto_id = v_item.producto_id
        AND vs.sucursal_id = p_sucursal_id
        AND vs.empresa_id = p_empresa_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'VARIANT_STOCK_ROW_NOT_FOUND: %', v_item.variante_id
          USING ERRCODE = '55000';
      END IF;

      IF v_stock < v_item.cantidad THEN
        RAISE EXCEPTION 'INSUFFICIENT_VARIANT_STOCK: variant %, available %, requested %',
          v_item.variante_id, v_stock, v_item.cantidad
          USING ERRCODE = 'P0001';
      END IF;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'productoId', v_producto.id,
        'varianteId', v_variante.id,
        'varianteCodigo', v_variante.codigo,
        'varianteNombre', v_variante.nombre,
        'nombre', v_producto.nombre,
        'unidad', v_producto.unidad,
        'cantidad', v_item.cantidad,
        'precioCatalogo', v_variante.precio,
        'tipoIgv', v_producto.tipo_igv,
        'stockDisponible', v_stock
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'tipoDocumento', v_cliente.tipo_doc,
      'numeroDocumento', v_cliente.numero,
      'nombre', v_cliente.nombre,
      'limiteCredito', v_cliente.limite_credito,
      'saldoCredito', v_cliente.saldo_credito
    ),
    'lineas', v_result,
    'catalogValidated', true,
    'stockReserved', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_validar_cliente_catalogo_interno(integer, integer, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_validar_cliente_catalogo_interno(integer, integer, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.pos_venta_validar_cliente_catalogo_interno(integer, integer, integer, jsonb) FROM authenticated;


-- RPC de prevalidación. Se puede llamar desde el cliente para comprobar el contexto,
-- detectar reintentos y validar cliente/catálogo, pero NO reserva stock ni vende.
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
  v_hash text;
  v_cliente_id integer;
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
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_ID' USING ERRCODE = '22023';
  END;

  v_catalog := public.pos_venta_validar_cliente_catalogo_interno(
    (v_context->>'empresaId')::integer,
    (v_context->>'sucursalId')::integer,
    v_cliente_id,
    p_payload->'lineas'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'decision', 'READY_FOR_SERVER_CALCULATION',
    'context', v_context,
    'idempotencia', v_idempotency,
    'catalogo', v_catalog,
    'saleCreated', false,
    'stockReserved', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_preparar_auth(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_venta_preparar_auth(jsonb) TO authenticated;
