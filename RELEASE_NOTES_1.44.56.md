# Mi Carrito POS v1.44.56

## Recuperación automática de cobros pendientes

- El POS inspecciona el almacenamiento durable al entrar con una sesión Supabase y consulta el estado del intento pendiente usando la misma clave y el mismo payload.
- Antes de enviar una venta se conserva también una copia local del ticket (cliente, líneas, pagos, importes y fecha), sin tokens de autenticación.
- Si Supabase confirma la venta, se reconstruye el comprobante local con el ID, serie y correlativo reales, se guarda en IndexedDB y se abre el ticket para imprimirlo.
- Si la consulta devuelve `NOT_FOUND_YET`, falla la conexión o el registro local está incompleto, el intento no se elimina. Se muestra una alerta con acción para verificar nuevamente.
- Mientras exista un intento no resuelto, el botón Cobrar queda bloqueado para impedir una venta diferente.
- Se conserva el comportamiento de idempotencia y no se agrega fallback al backend heredado ni a la cola offline.

## Límites de validación

- Suite Node `supabase/migrations-preview/*.test.mjs` + `supabase/tests/*.test.mjs`: 123 aprobadas, 0 fallidas, 2 omitidas (requieren staging).
- Sintaxis TypeScript/TSX de los tres archivos modificados: verificada mediante transpile.
- Build Vite completo: pendiente porque `npm ci` no terminó dentro del tiempo disponible.
- Vitest de frontend: pendiente por dependencias no instaladas.
- Sin SQL runtime, sin migraciones ejecutadas, sin despliegue Cloudflare y con `VITE_SUPABASE_SALES_ENABLED=false`.
