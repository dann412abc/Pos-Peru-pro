# Mi Carrito POS v1.44.48

- Añade helper interno para insertar cabecera, líneas y pagos de boleta/factura.
- Correlativo atómico con UPDATE RETURNING.
- Idempotencia SHA-256 dentro de la transacción.
- Costos leídos desde producto_stock / producto_variante_stock.
- Descuentos limitados a ADMIN con motivo obligatorio.
- Sin permisos de ejecución para PUBLIC, anon o authenticated.
- No modifica stock, lotes, caja ni cuentas por cobrar; no habilita Cobrar.
- SQL preview-only; no ejecutar en Supabase todavía.
