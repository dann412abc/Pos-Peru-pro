-- PREVIEW SOLAMENTE. NO EJECUTAR EN PRODUCCION.
-- Verificar primero que public.usuario existe y que el vínculo de identidades
-- fue auditado manualmente. No vincular por email o username automáticamente.
BEGIN;
ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS supabase_auth_user_id uuid NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_supabase_auth_user_id
  ON public.usuario (supabase_auth_user_id)
  WHERE supabase_auth_user_id IS NOT NULL;
COMMIT;

-- Este preview NO habilita RLS ni crea políticas genéricas.
-- Las políticas deben diseñarse por tabla después de inspeccionar el esquema
-- real, sus FKs y los roles de conexión. Nunca exponer service_role al cliente.
