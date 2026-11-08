# Mi Carrito POS v1.44.34

- Endurece la validación de la preconsulta de idempotencia de ventas en Cloudflare.
- Valida cada línea: producto, variante opcional, cantidad positiva, precio y descuento no negativos.
- Valida pagos: métodos admitidos (EFECTIVO, TARJETA, YAPE, PLIN, CREDITO) y montos positivos.
- Las solicitudes inválidas se rechazan antes de llamar a Supabase.
- No registra ventas ni modifica stock. La RPC transaccional de creación sigue pendiente y el cobro Supabase permanece protegido.
- No se ejecutaron migraciones ni se desplegó Cloudflare.
