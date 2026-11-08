-- v1.44.54 | Consulta segura de venta por clave idempotente.
-- PREVIEW ONLY. No crea ventas ni modifica inventario, caja, correlativos o pagos.
CREATE OR REPLACE FUNCTION public.pos_venta_idempotencia_consultar_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_usuario_id integer;
  v_empresa_id integer;
  v_sucursal_id integer;
  v_key text;
  v_hash text;
  v_existing record;
  v_payments jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'SALE_STATUS_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  SELECT u.id, u.empresa_id
    INTO v_usuario_id, v_empresa_id
  FROM public.usuario u
  WHERE u.supabase_auth_user_id = v_auth
    AND u.activo = true;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'SALE_STATUS_USER_NOT_LINKED' USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SALE_STATUS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_sucursal_id := NULLIF(p_payload->>'sucursalId','')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SALE_STATUS_BRANCH_INVALID' USING ERRCODE = '22023';
  END;

  v_key := p_payload->>'idempotencyKey';
  IF v_sucursal_id IS NULL OR v_sucursal_id <= 0
     OR v_key IS NULL OR v_key !~ '^[A-Za-z0-9._:-]{12,100}$' THEN
    RAISE EXCEPTION 'SALE_STATUS_KEY_OR_BRANCH_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sucursal s
    JOIN public.usuario_sucursal us ON us.sucursal_id = s.id
    WHERE s.id = v_sucursal_id
      AND s.empresa_id = v_empresa_id
      AND us.usuario_id = v_usuario_id
  ) THEN
    RAISE EXCEPTION 'SALE_STATUS_BRANCH_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_hash := encode(
    sha256(convert_to((p_payload - 'idempotencyKey')::text, 'UTF8')),
    'hex'
  );

  SELECT c.id, c.tipo, c.serie, c.correlativo, c.total, c.estado,
         c.request_hash, c.sucursal_id
    INTO v_existing
  FROM public.comprobante c
  WHERE c.empresa_id = v_empresa_id
    AND c.sucursal_id = v_sucursal_id
    AND c.idempotency_key = v_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'existente', false,
      'decision', 'NOT_FOUND_YET',
      'message', 'No se encontró un comprobante confirmado con esta clave. La solicitud puede seguir en curso; conserva la misma clave para reintentar.'
    );
  END IF;

  IF v_existing.request_hash IS NULL OR v_existing.request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'SALE_STATUS_EXISTING_HASH_UNVERIFIABLE' USING ERRCODE = '55000';
  END IF;

  IF v_existing.request_hash <> v_hash THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'metodo', cp.metodo_pago,
        'monto', cp.monto
      ) ORDER BY cp.id
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM public.comprobante_pago cp
  WHERE cp.comprobante_id = v_existing.id;

  RETURN jsonb_build_object(
    'ok', true,
    'existente', true,
    'decision', 'SALE_CONFIRMED',
    'comprobanteId', v_existing.id,
    'tipo', v_existing.tipo,
    'serie', v_existing.serie,
    'correlativo', v_existing.correlativo,
    'total', v_existing.total,
    'estado', v_existing.estado,
    'pagos', v_payments,
    'idempotentReplay', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb) TO authenticated;

COMMENT ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb)
IS 'Consulta de solo lectura del estado de venta por clave idempotente, con identidad y sucursal derivadas de auth.uid(). No exige caja abierta y no modifica datos. PREVIEW ONLY.';
