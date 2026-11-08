-- PREVIEW SOLAMENTE. NO EJECUTAR EN PRODUCCION.
-- Lectura de proveedores aislada por empresa y usuario autenticado.
BEGIN;
CREATE OR REPLACE FUNCTION public.pos_proveedores_listar_auth()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $fn$
DECLARE v_auth uuid:=auth.uid(); v_empresa integer; v_result jsonb;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada' USING ERRCODE='28000'; END IF;
  SELECT empresa_id INTO v_empresa
  FROM public.usuario
  WHERE supabase_auth_user_id=v_auth AND activo=true;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'Usuario POS no vinculado o inactivo' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',p.id,'tipo_doc',p.tipo_doc,'numero',p.numero,'nombre',p.nombre,
    'direccion',p.direccion,'telefono',p.telefono,'email',p.email,
    'contacto',p.contacto,'activo',p.activo,'created_at',p.created_at,'updated_at',p.updated_at
  ) ORDER BY lower(p.nombre),p.id),'[]'::jsonb)
  INTO v_result
  FROM public.proveedor p
  WHERE p.empresa_id=v_empresa;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.pos_proveedores_listar_auth() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_proveedores_listar_auth() TO authenticated;
COMMENT ON FUNCTION public.pos_proveedores_listar_auth() IS 'Lista proveedores de la empresa asociada a auth.uid(); no acepta empresa_id desde el cliente.';
COMMIT;
