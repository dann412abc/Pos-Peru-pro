-- PREVIEW SOLAMENTE. Revisar esquema y ejecutar primero en staging.
-- Devuelve únicamente cajas abiertas del usuario autenticado en una sucursal autorizada.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_compras_cajas_abiertas_auth(p_sucursal_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE
  v_auth uuid := auth.uid();
  v_usuario integer;
  v_empresa integer;
  v_cajas jsonb;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000';
  END IF;

  SELECT u.id,u.empresa_id INTO v_usuario,v_empresa
  FROM public.usuario u
  WHERE u.supabase_auth_user_id=v_auth AND u.activo=true;
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501';
  END IF;

  IF p_sucursal_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuario_sucursal us
    JOIN public.sucursal s ON s.id=us.sucursal_id
    WHERE us.usuario_id=v_usuario AND us.sucursal_id=p_sucursal_id AND s.empresa_id=v_empresa
  ) THEN
    RAISE EXCEPTION 'Sucursal no autorizada' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',c.id,
    'saldoInicial',c.saldo_inicial,
    'fechaApertura',c.fecha_apertura
  ) ORDER BY c.fecha_apertura DESC),'[]'::jsonb)
  INTO v_cajas
  FROM public.caja c
  WHERE c.sucursal_id=p_sucursal_id
    AND c.usuario_id=v_usuario
    AND c.estado='ABIERTA';

  RETURN jsonb_build_object('cajas',v_cajas);
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_compras_cajas_abiertas_auth(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_compras_cajas_abiertas_auth(integer) TO authenticated;
COMMIT;
