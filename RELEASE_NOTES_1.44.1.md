# Mi Carrito POS v1.44.1

- Continuación de la migración sin VPS: perfil de identidad POS resuelto desde Supabase Auth en Cloudflare Pages Functions.
- RPC fija `pos_mi_perfil_auth()` basada en `auth.uid()`; no acepta usuario objetivo desde el cliente.
- Validación de usuario activo y sucursales asociadas.
- Pruebas de contrato y checklist de vinculación.
- Login actual y API NestJS se conservan para evitar interrupción durante la migración.
- SQL de vista previa no ejecutado; no se modificó ningún servicio remoto.
