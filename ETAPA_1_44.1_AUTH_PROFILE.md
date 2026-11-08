# Etapa 1 — Resolución segura de perfil POS con Supabase Auth

- Se añade el endpoint Cloudflare Pages `GET /api/edge/auth/profile`.
- El endpoint exige Bearer token, llama a una RPC fija y no recibe identificadores de usuario del cliente.
- Se añade SQL de vista previa `pos_mi_perfil_auth()`: deriva la identidad de `auth.uid()`, requiere usuario POS activo y al menos una sucursal, y devuelve solo campos operativos.
- Se restringe ejecución SQL a `authenticated`.
- Se añaden pruebas de sesión ausente y resolución de perfil sin confiar en `usuario_id` enviado por el navegador.
- Se documenta el procedimiento manual de vinculación y validación en staging.

No se cambia el login activo, no se ejecuta SQL, no se crean usuarios Auth, no se modifica Supabase remoto y no se despliega Cloudflare. El paso 1 aún requiere completar alta/invitación, vinculación auditada, refresh/logout y pruebas RLS antes de retirar NestJS.
