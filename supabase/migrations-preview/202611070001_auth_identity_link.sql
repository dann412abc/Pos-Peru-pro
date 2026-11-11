-- PREVIEW / VALIDACION DE IDENTIDAD PARA EL ESQUEMA REAL DE POS AYNI PERU.
-- La tabla public.usuario ya dispone de auth_user_id UUID y un indice UNIQUE.
-- No crear una segunda columna ni re-vincular usuarios. Este archivo solo valida
-- el contrato esperado antes de instalar la RPC de perfil.
DO $validation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuario'
      AND column_name = 'auth_user_id'
      AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Falta public.usuario.auth_user_id UUID; detener y revisar el esquema antes de continuar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'usuario'
      AND indexdef ILIKE '%UNIQUE%auth_user_id%'
  ) THEN
    RAISE EXCEPTION 'Falta indice UNIQUE para public.usuario.auth_user_id; detener y revisar antes de continuar.';
  END IF;
END
$validation$;

-- No modifica datos, no crea usuarios Auth y no vincula por correo/username.
-- No habilita RLS ni cambia roles o permisos de tablas.
