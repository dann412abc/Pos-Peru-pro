-- PREVIEW SOLAMENTE. Validado contra el esquema actual de POS AYNI PERU.
-- Resuelve exclusivamente el usuario POS asociado a auth.uid() mediante
-- public.usuario.auth_user_id (columna UUID existente). No acepta usuario_id
-- desde el cliente y no realiza vinculaciones por correo o nombre de usuario.
CREATE OR REPLACE FUNCTION public.pos_mi_perfil_auth()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE = '28000';
  END IF;

  SELECT jsonb_build_object(
    'id', u.id::text,
    'username', u.username,
    'nombre', u.nombre,
    'rol', u.rol::text,
    'empresaId', u.empresa_id,
    'sucursales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id::text, 'nombre', s.nombre) ORDER BY s.id)
      FROM public.usuario_sucursal us
      JOIN public.sucursal s ON s.id = us.sucursal_id AND s.empresa_id = u.empresa_id
      WHERE us.usuario_id = u.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.usuario u
  WHERE u.auth_user_id = v_user_id
    AND u.activo = true;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'La identidad no está vinculada a un usuario POS activo' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_array_length(v_result->'sucursales') = 0 THEN
    RAISE EXCEPTION 'El usuario POS no tiene sucursales asignadas' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_mi_perfil_auth() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_mi_perfil_auth() FROM anon;
GRANT EXECUTE ON FUNCTION public.pos_mi_perfil_auth() TO authenticated;

COMMENT ON FUNCTION public.pos_mi_perfil_auth() IS
'Retorna únicamente el perfil POS vinculado a auth.uid() mediante usuario.auth_user_id; no acepta identificadores del cliente.';
