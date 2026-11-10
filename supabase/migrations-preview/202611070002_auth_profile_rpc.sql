-- PREVIEW / VALIDACION SOLAMENTE. No ejecutar DDL ni modificar datos.
-- La aplicación consume la función existente public.mi_perfil_pos().
-- Esta consulta verifica que exista, sea SECURITY DEFINER y que authenticated
-- tenga permiso EXECUTE. La identidad se resuelve internamente mediante auth.uid().
SELECT
  p.oid::regprocedure AS function_name,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'mi_perfil_pos'
  AND pg_get_function_identity_arguments(p.oid) = '';
