# Mi Carrito POS v1.44.12

## Proveedores: lectura aislada por empresa
- Nueva RPC `pos_proveedores_listar_auth()` para listar proveedores según la identidad autenticada en Supabase.
- Nuevo endpoint Cloudflare `GET /api/edge/parties/suppliers` con Bearer obligatorio.
- La pestaña Proveedores utiliza la API Supabase para listar, crear, editar y desactivar proveedores.
- Se evita depender de que el RPC de catálogo general incluya proveedores.

## Seguridad y límites
- La empresa se obtiene en SQL desde `auth.uid()` y `usuario.supabase_auth_user_id`.
- El endpoint no acepta ni reenvía `empresa_id` del navegador.
- La función es `SECURITY DEFINER` con `search_path` fijado y ejecución concedida solo a `authenticated`.

## Pendiente
- La compra/recepción y sus pagos siguen en NestJS. Esta versión no las migra ni modifica.
- La migración SQL es un archivo preview y no se ejecutó.
- Build integral y pruebas contra Supabase real/staging pendientes.
