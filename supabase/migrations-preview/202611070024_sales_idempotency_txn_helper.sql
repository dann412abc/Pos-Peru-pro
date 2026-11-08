-- PREVIEW / SOLO PARA INTEGRAR EN LA RPC PRINCIPAL.
-- No es una reserva de clave por sí sola: la garantía final es el índice UNIQUE
-- de comprobante y el manejo específico de unique_violation en el mismo INSERT.
-- Esta función debe invocarse desde public.pos_venta_crear_auth dentro de su
-- transacción, nunca como una llamada HTTP independiente para "reservar".

CREATE OR REPLACE FUNCTION public.pos_venta_idempotencia_resolver_interna(
  p_empresa_id integer,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_existing record;
BEGIN
  IF p_empresa_id IS NULL OR p_empresa_id <= 0 THEN
    RAISE EXCEPTION 'INVALID_COMPANY_SCOPE' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL
     OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{12,100}$' THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;

  IF p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_SHA256_HASH' USING ERRCODE = '22023';
  END IF;

  -- Serializa las solicitudes con la misma empresa+clave durante la transacción.
  -- hashtextextended devuelve bigint; colisiones solo provocan espera adicional.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_empresa_id::text || ':' || p_idempotency_key, 0)
  );

  SELECT c.id, c.tipo, c.serie, c.correlativo, c.total, c.estado, c.request_hash
    INTO v_existing
  FROM public.comprobante AS c
  WHERE c.empresa_id = p_empresa_id
    AND c.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'existente', false,
      'requestHash', p_request_hash,
      'decision', 'CONTINUE_CREATE'
    );
  END IF;

  IF v_existing.request_hash IS NULL
     OR v_existing.request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'EXISTING_SALE_HASH_NOT_VERIFIABLE'
      USING ERRCODE = '55000';
  END IF;

  IF v_existing.request_hash <> p_request_hash THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'existente', true,
    'decision', 'RETURN_EXISTING',
    'comprobanteId', v_existing.id,
    'tipo', v_existing.tipo,
    'serie', v_existing.serie,
    'correlativo', v_existing.correlativo,
    'total', v_existing.total,
    'estado', v_existing.estado,
    'requestHash', p_request_hash
  );
END;
$function$;

-- Solo la RPC SECURITY DEFINER propietaria podrá invocarla.
REVOKE ALL ON FUNCTION public.pos_venta_idempotencia_resolver_interna(integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_venta_idempotencia_resolver_interna(integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.pos_venta_idempotencia_resolver_interna(integer, text, text) FROM authenticated;
