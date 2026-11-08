# Vinculación de identidades Supabase Auth — etapa 1

## Estado
La API Edge `GET /api/edge/auth/profile` ya consulta `pos_mi_perfil_auth()` usando el JWT del usuario. La función SQL de vista previa se encuentra en `migrations-preview/202611070002_auth_profile_rpc.sql`.

## Antes de aplicar SQL
1. Confirmar en el proyecto de staging que existen `public.usuario`, `public.usuario_sucursal` y `public.sucursal`.
2. Confirmar nombres de columnas `empresa_id`, `supabase_auth_user_id`, `activo`, `usuario_id` y `sucursal_id`.
3. Aplicar primero la migración de columna/índice de identidad `202611070001_auth_identity_link.sql` en staging.
4. Crear las identidades Supabase Auth por invitación o alta administrativa verificada.
5. Vincular cada UUID a un usuario POS por ID interno comprobado. Nunca hacer matching automático por email o username.
6. Aplicar la función `202611070002_auth_profile_rpc.sql` en staging y probar usuario vinculado, no vinculado, desactivado, sin sucursales y token expirado.

## Pruebas de seguridad obligatorias
- El cliente no puede enviar un `usuario_id` para seleccionar otro perfil.
- La función obtiene identidad exclusivamente de `auth.uid()`.
- `anon` y `PUBLIC` no tienen permiso de ejecución; `authenticated` sí.
- Un usuario no puede quedar vinculado a dos usuarios POS (índice único parcial previo).
- La función devuelve solo campos operativos y sucursales asignadas; nunca `password_hash`, tokens ni datos de otra empresa.
- La función no crea ni vincula identidades automáticamente.

## No habilitar todavía
El login principal del frontend sigue usando el backend anterior. No cambiar el formulario de usuario/contraseña a correo Supabase hasta que las cuentas Auth estén creadas y vinculadas, se haya implementado refresh/logout y se haya probado la reversión.
