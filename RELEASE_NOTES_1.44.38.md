# Mi Carrito POS v1.44.38

- Corregido el preflight de esquema para la futura RPC de ventas según las migraciones TypeORM reales.
- Añadidas pruebas estáticas para detectar requisitos de columnas sin respaldo y operaciones de escritura en el diagnóstico.
- Se mantiene el enfoque Supabase + Cloudflare.
- No se ejecutaron migraciones, no se modificó Supabase y la RPC transaccional de ventas sigue pendiente.
