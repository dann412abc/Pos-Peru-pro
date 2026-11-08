# Mi Carrito POS v1.44.27

## Bloque: auditoría de Compras en modo Supabase

- Las alertas de lotes vencidos y próximos a vencer del módulo Compras consultan `fetchSupabaseInventoryExpiries(sucursalId, 30)` cuando `VITE_AUTH_PROVIDER=supabase`.
- Se conserva el endpoint NestJS `/inventario/vencimientos` únicamente para el modo backend tradicional.
- Si falla la consulta de vencimientos en Supabase, se muestra un mensaje de error en lugar de ocultar silenciosamente el fallo.
- Se añade una prueba de contrato para evitar que el modo Supabase vuelva a depender de ese endpoint NestJS.

## Validación y límites

- No se ejecutaron migraciones SQL.
- No se modificó el proyecto remoto de Supabase.
- No se desplegó Cloudflare.
- Las pruebas de contrato y validaciones estáticas se ejecutan en esta entrega; la compilación integral y pruebas reales contra PostgreSQL/Supabase requieren un entorno configurado.
