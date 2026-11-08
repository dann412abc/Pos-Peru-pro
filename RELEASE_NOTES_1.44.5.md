# Mi Carrito POS v1.44.5

- Conectada la lectura de productos y clientes al catálogo Supabase mediante Cloudflare Pages Functions cuando el proveedor de autenticación Supabase está habilitado.
- Añadidos normalizadores para columnas SQL y mapeo de stock por sucursal.
- Se mantiene el modo backend anterior cuando Supabase Auth no está habilitado.
- Operaciones de escritura no migradas: permanecen en el backend anterior; no se anuncia migración completa.
- SQL remoto no ejecutado. Build integral e integración real requieren dependencias y entorno Supabase de staging.
