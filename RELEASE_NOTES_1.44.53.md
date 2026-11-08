# Mi Carrito POS v1.44.53

## Integración preparada de cobro Supabase

- Añade `frontend/src/api/supabaseSales.ts` para llamar a `pos_venta_crear_auth(p_payload)` por Cloudflare Pages Functions.
- El frontend envía el `clienteId` real de Supabase; se resuelve el registro Consumidor Final desde el catálogo remoto cuando está disponible.
- El resultado solo se considera exitoso si Supabase devuelve `ok`, `comprobanteId`, serie y correlativo válidos.
- La clave de idempotencia se conserva en `sessionStorage` para reintentos del mismo contenido y se elimina únicamente tras confirmación.
- Se añade un bloqueo con `useRef` para evitar doble envío por doble clic.
- Se mantiene el carrito ante rechazo, sesión expirada, RPC no habilitada o respuesta ambigua.
- No hay fallback a NestJS ni a la cola offline en el flujo Supabase.
- El encendido de ventas Supabase requiere `VITE_SUPABASE_SALES_ENABLED=true`; su valor de ejemplo queda `false`.
- No se habilita automáticamente el cobro: sigue pendiente staging real, allowlist de Cloudflare y revisión de la RPC.

## Límites de esta entrega

- No ejecuta migraciones ni prueba contra una base Supabase.
- No habilita nota de venta; la RPC actual admite boleta y factura.
- No modifica Cloudflare ni variables remotas.

## Validación realizada

- Suite estática Node de migraciones y contratos: 111 aprobadas, 0 fallidas; 2 pruebas de staging omitidas por requerir conexión y autorización explícita.
- Sintaxis TypeScript/TSX de los cuatro archivos modificados o añadidos: correcta mediante transpilation check.
- El build completo `npm run build` no pudo completarse: la instalación `npm ci` agotó el tiempo disponible y dejó dependencias incompletas. Se retiró `node_modules` parcial del paquete. No se declara build Vite exitoso.
