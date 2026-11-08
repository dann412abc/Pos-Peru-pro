-- PREVIEW SOLAMENTE. NO EJECUTAR EN PRODUCCION SIN REVISION.
-- Corrige la huella de idempotencia: SHA-256 hexadecimal (64 caracteres).
-- No registra ventas ni modifica inventario, caja, pagos o correlativos.
BEGIN;

ALTER TABLE public.comprobante
  ADD COLUMN IF NOT EXISTS request_hash varchar(64);

ALTER TABLE public.comprobante
  ALTER COLUMN request_hash TYPE varchar(64);

CREATE OR REPLACE FUNCTION public.pos_venta_idempotencia_consultar_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $fn$
DECLARE
  v_auth uuid := auth.uid();
  v_empresa integer;
  v_usuario integer;
  v_sucursal integer;
  v_key text;
  v_hash varchar(64);
  v_existing record;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Sesion no autenticada' USING ERRCODE = '28000';
  END IF;

  SELECT u.id, u.empresa_id
    INTO v_usuario, v_empresa
  FROM public.usuario u
  WHERE u.supabase_auth_user_id = v_auth
    AND u.activo = true;

  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Solicitud de venta invalida' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_sucursal := NULLIF(p_payload->>'sucursalId', '')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Sucursal invalida' USING ERRCODE = '22023';
  END;

  v_key := p_payload->>'idempotencyKey';
  IF v_sucursal IS NULL OR v_sucursal <= 0
     OR v_key IS NULL
     OR v_key !~ '^[A-Za-z0-9._:-]{12,100}$' THEN
    RAISE EXCEPTION 'Sucursal o clave de idempotencia invalida' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sucursal s
    JOIN public.usuario_sucursal us ON us.sucursal_id = s.id
    WHERE s.id = v_sucursal
      AND s.empresa_id = v_empresa
      AND us.usuario_id = v_usuario
  ) THEN
    RAISE EXCEPTION 'No tiene acceso a la sucursal seleccionada' USING ERRCODE = '42501';
  END IF;

  -- JSONB normaliza el orden de claves; se excluye la clave idempotente.
  v_hash := encode(sha256(convert_to((p_payload - 'idempotencyKey')::text, 'UTF8')), 'hex');

  SELECT c.id, c.request_hash
    INTO v_existing
  FROM public.comprobante c
  WHERE c.empresa_id = v_empresa
    AND c.idempotency_key = v_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'existente', false, 'requestHash', v_hash,
      'algoritmo', 'SHA-256'
    );
  END IF;

  IF v_existing.request_hash IS NULL OR length(v_existing.request_hash) <> 64 THEN
    RAISE EXCEPTION 'La venta existente no tiene huella SHA-256 verificable; requiere revision'
      USING ERRCODE = '55000';
  END IF;

  IF v_existing.request_hash <> v_hash THEN
    RAISE EXCEPTION 'La clave de idempotencia ya fue usada con otro contenido'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'existente', true, 'comprobanteId', v_existing.id,
    'requestHash', v_hash, 'algoritmo', 'SHA-256'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_venta_idempotencia_consultar_auth(jsonb) TO authenticated;

COMMIT;
