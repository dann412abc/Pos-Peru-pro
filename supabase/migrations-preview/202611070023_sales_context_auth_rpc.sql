-- PREVIEW / NO EJECUTAR EN PRODUCCION TODAVIA.
-- Bloque 1 de la futura venta: identidad autenticada, empresa/sucursal asignada
-- y caja abierta del usuario. No registra ventas ni modifica stock, caja o correlativos.
-- El bloqueo FOR UPDATE solo es útil cuando esta función se invoca desde la RPC
-- transaccional principal; una llamada independiente libera el bloqueo al terminar.

CREATE OR REPLACE FUNCTION public.pos_venta_contexto_auth(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_auth_user_id uuid;
  v_usuario_id integer;
  v_empresa_id integer;
  v_sucursal_id integer;
  v_caja_id integer;
  v_saldo_inicial numeric(12,2);
  v_rol varchar(10);
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_sucursal_id := NULLIF(p_payload->>'sucursalId','')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE = '22023';
  END;

  IF v_sucursal_id IS NULL OR v_sucursal_id <= 0 THEN
    RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE = '22023';
  END IF;

  SELECT u.id, u.empresa_id, u.rol
    INTO v_usuario_id, v_empresa_id, v_rol
  FROM public.usuario AS u
  WHERE u.supabase_auth_user_id = v_auth_user_id
    AND u.activo = TRUE
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_USER_NOT_LINKED_OR_INACTIVE' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.sucursal AS s
  JOIN public.usuario_sucursal AS us
    ON us.sucursal_id = s.id
  WHERE s.id = v_sucursal_id
    AND s.empresa_id = v_empresa_id
    AND us.usuario_id = v_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANCH_NOT_ASSIGNED' USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.saldo_inicial
    INTO v_caja_id, v_saldo_inicial
  FROM public.caja AS c
  WHERE c.sucursal_id = v_sucursal_id
    AND c.usuario_id = v_usuario_id
    AND c.estado = 'ABIERTA'
  ORDER BY c.id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPEN_CASH_REGISTER_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'usuarioId', v_usuario_id,
    'empresaId', v_empresa_id,
    'sucursalId', v_sucursal_id,
    'cajaId', v_caja_id,
    'saldoInicial', v_saldo_inicial,
    'rol', v_rol,
    'contextValidated', true,
    'saleCreated', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_venta_contexto_auth(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_venta_contexto_auth(jsonb) TO authenticated;
