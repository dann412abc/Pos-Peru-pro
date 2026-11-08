-- ETAPA 11 / Mi Carrito POS 1.11.0
-- PREVIEW PARA REVISION. NO EJECUTAR EN SUPABASE TODAVIA.
-- La migracion oficial equivalente esta en:
-- backend/src/database/migrations/1710000000010-supabase-auth-identity.ts

ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS supabase_auth_user_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_supabase_auth_user_id
  ON public.usuario (supabase_auth_user_id)
  WHERE supabase_auth_user_id IS NOT NULL;

-- No crea usuarios en auth.users, no vincula cuentas y no habilita RLS.
-- La vinculacion debe realizarse despues de verificar la identidad y aprobar
-- el usuario interno, empresa y sucursales correspondientes.
