# Etapa 1.44.2 — Ciclo de autenticación Supabase Auth

## Alcance implementado
- `POST /api/edge/auth/login`: intercambia correo/contraseña por sesión Supabase mediante GoTrue.
- `POST /api/edge/auth/refresh`: rota la sesión usando refresh token.
- `POST /api/edge/auth/logout`: invalida la sesión remota y exige Bearer.
- `POST /api/edge/auth/recover`: solicita recuperación sin revelar si el correo existe.
- Respuestas sin cache y sin exponer mensajes internos del proveedor.
- Validaciones de entrada y pruebas automatizadas para los nuevos endpoints.

## Configuración Cloudflare Pages
Variables server-side (no prefijo `VITE_`):
- `SUPABASE_URL`: URL HTTPS del proyecto.
- `SUPABASE_ANON_KEY`: clave publicable/anon.

En Supabase Auth configurar URL del sitio y redirect URLs HTTPS de producción y preview. Configurar proveedor SMTP para entrega fiable de recuperación.

## Límites deliberados
- La interfaz de login actual y `AuthContext` aún usan el backend NestJS. Esta etapa agrega endpoints Edge, pero NO cambia el proveedor de autenticación activo en el frontend.
- El perfil POS requiere ejecutar y validar `202611070002_auth_profile_rpc.sql` y vincular manualmente cada `usuario.supabase_auth_user_id`.
- No vincular identidades por coincidencia de correo o nombre de usuario automáticamente.
- No se ejecutó SQL ni se modificó Supabase remoto.
- El cierre remoto de sesión debe llamarse desde el cliente antes de limpiar tokens; esa integración frontend queda para la siguiente subetapa.
