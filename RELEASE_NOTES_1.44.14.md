# Mi Carrito POS v1.44.14

## Recepción transaccional de compras: RPC SQL preview

- Se agrega `supabase/migrations-preview/202611070008_purchase_receive_rpc.sql` con `pos_compra_recibir_auth(jsonb)`.
- La función deriva usuario y empresa de `auth.uid()` y valida la sucursal asignada, proveedor activo y productos/variantes de la empresa.
- Registra cabecera/detalles, lotes, movimientos de inventario, stock y costo promedio ponderado, pagos, salidas de caja asociadas y saldo pendiente dentro de una sola transacción PostgreSQL.
- Incluye validación de IGV (costo unitario con IGV incluido), condición contado/crédito, límites de líneas/pagos e idempotencia.
- Se amplía el contrato TypeScript para aceptar cantidad de empaques.

## Límites y precauciones

- Migración en modo preview: NO ejecutada. No se ha modificado Supabase ni Cloudflare remoto.
- El endpoint de Cloudflare y el cliente TS ya existían desde v1.44.13; la pantalla de Compras todavía no llama a la RPC.
- Requiere que el esquema staging tenga las migraciones de compras, lotes, variantes, compras por variantes, vencimientos y vínculo `usuario.supabase_auth_user_id`.
- La compra con pago por transferencia debe registrarse sin `cajaId`; transferencias no se convierten en movimientos de caja.
- No se ha ejecutado PostgreSQL real ni prueba integral de transacción. Revisión SQL y pruebas en staging siguen pendientes antes de conectar UI/producción.
