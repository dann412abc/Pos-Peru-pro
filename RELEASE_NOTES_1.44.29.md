# Mi Carrito POS v1.44.29

## Bloque: catálogo Supabase en Venta Rápida

- Venta Rápida carga productos activos desde `fetchCurrentSupabaseCatalog` y `mapSupabaseProductRows` cuando `VITE_AUTH_PROVIDER=supabase`.
- Clientes para el POS se hidratan desde el mismo catálogo usando `mapSupabaseCustomerRows`.
- Las variantes se consultan desde el catálogo autorizado de Supabase, sin llamar al endpoint NestJS de variantes en modo Supabase.
- El lector de código de barras puede resolver códigos de variantes usando los datos del catálogo Supabase.
- El flujo tradicional y modo demo se conservan.

## Pendientes identificados

- La consulta del estado de caja en Venta Rápida todavía usa `/caja/estado` de NestJS.
- El cobro definitivo todavía usa `POST /ventas` de NestJS. No se cambia hasta contar con una RPC SQL transaccional revisada para ventas, inventario, pagos mixtos, caja, crédito e idempotencia.
- No se ejecutaron migraciones SQL, no se modificó Supabase remoto y no se desplegó Cloudflare.

## Validación

- Se agregan pruebas de contrato UI para catálogo, clientes, variantes y búsqueda por código.
- Las pruebas de contrato no sustituyen pruebas integrales de navegador ni pruebas contra PostgreSQL/Supabase.
