# Mi Carrito POS v1.44.25

## Bloque: control de vencimientos con Supabase + Cloudflare

- Nueva RPC de solo lectura `pos_inventario_vencimientos_auth(p_sucursal_id, p_dias)`.
- Nuevo endpoint `GET /api/edge/inventory/expiries`.
- La empresa se deriva de `auth.uid()` y la sucursal se valida contra `usuario_sucursal`.
- La consulta devuelve lotes con cantidad disponible y fecha de vencimiento, incluyendo vencidos y próximos a vencer dentro del rango seleccionado.
- La pantalla `Vencimientos` utiliza Supabase cuando `VITE_AUTH_PROVIDER=supabase`; conserva el backend anterior para otros modos.
- No registra mermas, no modifica existencias ni elimina lotes.
- Migración preview: `202611070018_inventory_expiry_read_rpc.sql`.

## Validación local
- Pruebas de contrato con Node test runner.
- `node --check` del endpoint.
- Transpilación TypeScript/TSX.
- Integridad del ZIP.

## Pendiente
- Revisar columnas y permisos contra el esquema real de Supabase staging.
- Ejecutar migración únicamente con autorización.
- Pruebas integrales con lotes reales y distintos roles/sucursales.
- Build integral de frontend.

No se ejecutaron migraciones ni despliegues.
