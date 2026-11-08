# v1.44.18 — Prevalidación de devoluciones a proveedores

- Nueva RPC de solo lectura para validar lotes, cantidades, compra y sucursal del usuario.
- Nueva ruta Cloudflare POST /api/edge/purchases/return-preview.
- Nuevo cliente TypeScript para consumir la prevalidación.
- No se ha conectado el botón de devolución ni se ha implementado la mutación definitiva.
- Los importes son estimados: no reservan stock y deben recalcularse con bloqueos en la transacción final.
- No ejecutar la migración preview sin contrastar con esquema real y pruebas staging.
