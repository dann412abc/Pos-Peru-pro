# Mi Carrito POS v1.44.49

- Añade descuento transaccional de stock para productos y variantes.
- Consolida líneas repetidas y bloquea saldos en orden determinista.
- Implementa asignación FEFO con vencimiento más próximo primero.
- Excluye lotes vencidos y evita mezclar producto/variante/sucursal.
- Registra salidas por lote y movimientos de inventario.
- Cualquier insuficiencia aborta la transacción completa.
- Caja y crédito continúan pendientes; no habilitar Cobrar.
- SQL preview-only; no ejecutar en Supabase todavía.
