# Mi Carrito POS 1.44.64

## Historial persistente de movimientos de caja
- Se agrega RPC autenticada `pos_caja_movimientos_listar_auth`.
- Se agrega lectura `GET /api/edge/cash/movements?cajaId=...`.
- La pantalla Cierre de Caja consulta los últimos 100 movimientos desde Supabase al recargar.
- La autorización se deriva de `auth.uid()`, usuario POS activo, empresa, sucursal asignada y caja propia.
- El modo no Supabase conserva su ruta anterior.

## Seguridad y despliegue
- Migración SQL incluida únicamente en `supabase/migrations-preview/`.
- No se ejecutó SQL en Supabase ni se desplegó Cloudflare.
- Validar esquema real en staging antes de aplicar la migración.
