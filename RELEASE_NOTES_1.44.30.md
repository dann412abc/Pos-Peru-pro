# Mi Carrito POS v1.44.30

## Bloque: estado de caja de Venta Rápida en Supabase

- Venta Rápida deja de consultar `GET /caja/estado` cuando `VITE_AUTH_PROVIDER=supabase`.
- Reutiliza la consulta segura de cajas abiertas `/api/edge/purchases/cash-registers`, cuya RPC deriva usuario y empresa desde `auth.uid()` y valida la sucursal autorizada.
- La caja abierta se normaliza al modelo local para mantener la caché de lectura y habilitar el estado de caja en Venta Rápida.
- El modo NestJS conserva su endpoint anterior.
- Se añadieron pruebas de contrato UI para asegurar la selección de proveedor y el mapeo de la caja.

## Validación

- 33 pruebas Node del conjunto Edge aprobadas.
- `node --check` de Cloudflare Functions aprobado.
- No se ejecutaron migraciones SQL, no se modificó Supabase remoto y no se desplegó Cloudflare.
- No se ejecutó build integral: las dependencias frontend no están instaladas en el entorno de trabajo.

## Pendiente

- El cobro definitivo de Venta Rápida continúa usando `POST /ventas` de NestJS.
- Apertura/cierre de caja y registro transaccional de ventas en Supabase requieren sus propias RPC y pruebas de staging.
