# Mi Carrito POS v1.44.20

## Bloque Compras: anulación segura

- Nueva RPC preview `pos_compra_anular_auth(jsonb)` en `supabase/migrations-preview/202611070013_purchase_cancel_rpc.sql`.
- Nuevo endpoint Cloudflare `POST /api/edge/purchases/cancel`.
- Cliente frontend `anularCompraSupabase()` y conexión del botón Anular en modo Supabase.
- La RPC deriva empresa/usuario desde `auth.uid()` y valida pertenencia a sucursal.
- Rechaza compras con pagos o devoluciones registradas.
- Solo revierte si cada lote de compra conserva íntegra su cantidad y stock/costo coinciden con el snapshot posterior a la recepción.
- Revierte stock y costo promedio al snapshot anterior, marca la compra ANULADA y conserva auditoría en movimientos de inventario.
- No borra registros contables ni inventario histórico.

## Límites y validación

- No ejecutado en PostgreSQL real ni en Supabase staging.
- No ejecutar la migración sin revisar el esquema y probar con datos de staging.
- Compras con pagos/devoluciones o inventario modificado requieren regularización específica; la RPC las bloquea deliberadamente.
- Build integral pendiente.
