# Mi Carrito POS 1.17.0

## Producto único vs. producto con variantes
- Selector explícito de variantes/presentaciones en el formulario de productos.
- Producto único con código de barras, precio y stock propios.
- Producto padre con variantes, sin stock/precio de venta propios.
- Control de modalidad en API, gestión de variantes y validación de ventas.
- Escaneo de código de barras para producto único y para cada presentación.
- Migración aditiva 0014 incluida, no ejecutada.

## Infraestructura
- Supabase PostgreSQL y Cloudflare; sin servicios alternativos añadidos.
- No se ejecutaron migraciones ni se modificó Supabase remoto.
- No se desplegó en Cloudflare.
