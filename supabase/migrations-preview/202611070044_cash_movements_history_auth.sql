-- PREVIEW ONLY: historial persistente de movimientos de caja.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_caja_movimientos_listar_auth(p_caja_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid := auth.uid();
  v_usuario integer;
  v_empresa integer;
  v_result jsonb;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  IF p_caja_id IS NULL OR p_caja_id <= 0 THEN RAISE EXCEPTION 'CASH_REGISTER_ID_INVALID' USING ERRCODE='22023'; END IF;
  SELECT u.id,u.empresa_id INTO v_usuario,v_empresa
  FROM public.usuario u WHERE u.auth_user_id=v_auth AND u.activo=true;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.caja c
    JOIN public.sucursal s ON s.id=c.sucursal_id AND s.empresa_id=v_empresa
    JOIN public.usuario_sucursal us ON us.sucursal_id=c.sucursal_id AND us.usuario_id=v_usuario
    WHERE c.id=p_caja_id AND c.usuario_id=v_usuario
  ) THEN RAISE EXCEPTION 'Caja no encontrada o no autorizada' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'tipo',m.tipo,'metodoPago',m.metodo_pago,
    'monto',m.monto,'motivo',m.motivo,'createdAt',m.created_at
  ) ORDER BY m.created_at DESC,m.id DESC),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT cm.id,cm.tipo,cm.metodo_pago,cm.monto,cm.motivo,cm.created_at
    FROM public.caja_movimiento cm
    WHERE cm.caja_id=p_caja_id AND cm.usuario_id=v_usuario
    ORDER BY cm.created_at DESC,cm.id DESC
    LIMIT 100
  ) m;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_caja_movimientos_listar_auth(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_caja_movimientos_listar_auth(integer) TO authenticated;
COMMIT;
