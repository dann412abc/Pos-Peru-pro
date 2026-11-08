# Mi Carrito POS v1.44.21

- Órdenes de compra integradas en modo Supabase: listar, detalle, crear, enviar, cancelar y recibir parcialmente.
- RPC `pos_ordenes_compra_auth` con autorización por identidad POS y sucursal asignada.
- La recepción parcial compone `pos_compra_recibir_auth` dentro de la misma transacción y registra la relación orden/compra.
- Migración SQL preview `202611070014_purchase_orders_rpc.sql`; no ejecutar sin validar en staging.
