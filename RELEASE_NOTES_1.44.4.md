# Mi Carrito POS v1.44.4

- Añadida ruta Edge de lectura de catálogo base protegida por sesión Supabase.
- Añadido cliente TypeScript para consumir productos, categorías, variantes, stock, clientes y sucursales.
- Añadida migración SQL preview `202611070003_catalog_read_rpc.sql` con scope por empresa y sucursal autenticadas.
- Sin cambios en flujos actuales NestJS: migración gradual, no disruptiva.
- No se ejecutaron migraciones, no se modificó Supabase y no se desplegó Cloudflare.
- Build integral y pruebas de integración pendientes por instalar dependencias y probar con esquema staging real.
