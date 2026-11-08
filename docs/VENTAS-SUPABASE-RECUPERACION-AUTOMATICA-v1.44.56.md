# Recuperación automática de cobros — v1.44.56

## Flujo

1. Al abrir Venta Rápida con usuario Supabase, se calcula el ámbito `usuario:sucursal` y se busca un intento durable.
2. Si existe, se consulta `POST /api/edge/sales/idempotency-check` con el snapshot original, sin crear una venta nueva.
3. Si la RPC devuelve comprobante confirmado y existe `ticketSnapshot`, el POS reconstruye el objeto `Venta` con ID, serie, correlativo y total del servidor.
4. El comprobante se guarda/actualiza en IndexedDB por su clave de idempotencia y se muestra en `TicketModal`. Solo después se limpia el intento local.
5. Si no existe aún, la red falla o falta el snapshot, se conserva el registro y se bloquea Cobrar. El usuario puede volver a consultar manualmente.

## Integridad y seguridad

- No se persisten access tokens ni refresh tokens en el intento.
- La consulta remota sigue siendo de solo lectura y deriva identidad desde `auth.uid()`.
- La clave y el payload originales nunca se regeneran durante la recuperación.
- No se considera `NOT_FOUND_YET` un rechazo definitivo.
- No se altera inventario, caja, correlativos ni comprobantes desde el navegador.

## Límites

La recuperación reconstruye el ticket a partir del snapshot local y de los identificadores confirmados por la RPC. No sustituye una lectura oficial de detalle del comprobante desde PostgreSQL; esa lectura enriquecida queda para la siguiente etapa.
