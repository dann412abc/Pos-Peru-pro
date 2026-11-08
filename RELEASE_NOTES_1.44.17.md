# Mi Carrito POS v1.44.17

## Compras: pagos posteriores a proveedores
- Nueva RPC preview `pos_compra_registrar_pago_auth(jsonb)` para pagos parciales/totales.
- Empresa y usuario se derivan de `auth.uid()` y del vínculo `usuario.supabase_auth_user_id`.
- Bloqueo de compra/caja, validación de estado/saldo, idempotencia y actualización atómica de `compra_pago`, `compra`, `caja_movimiento`.
- Nueva ruta Cloudflare `POST /api/edge/purchases/payment`.
- Nuevo cliente `registrarPagoCompraSupabase` y conexión del formulario de pagos posteriores cuando `VITE_AUTH_PROVIDER=supabase`.
- En modo Supabase, las cuentas por pagar se derivan del historial de compras; las cajas abiertas siguen consultándose desde la API anterior, pendiente de migración.

## Pendiente
- Revisar nombres/tipos de columnas contra el esquema real de staging.
- Ejecutar pruebas SQL reales y pruebas de concurrencia/idempotencia en staging.
- Migrar lectura de cajas y módulos restantes de Compras (devoluciones, anulaciones, órdenes).
- No ejecutar esta migración automáticamente ni desplegar Cloudflare.
