# Mi Carrito POS v1.44.51

- Añade RPC autenticada `pos_venta_crear_auth`.
- Deriva identidad y alcance desde Supabase Auth.
- Serializa idempotencia y devuelve reintentos idénticos sin repetir la venta.
- Obtiene precios e IGV desde catálogo del servidor.
- Calcula importes y valida pagos/crédito en servidor.
- Orquesta el escritor interno de comprobante, pagos, inventario FEFO, caja y crédito en una sola transacción.
- Mantiene descuento global bloqueado y la nota de venta fuera del tipo fiscal actual.
- Preview-only: no ejecutar migraciones, no habilitar Cobrar ni desplegar antes de pruebas runtime.
