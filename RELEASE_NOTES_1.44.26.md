# Mi Carrito POS v1.44.26

## Bloque: catálogo de productos y variantes para Compras

- La pantalla Compras obtiene productos activos mediante `pos_catalogo_base_auth` a través de la API de catálogo Supabase + Cloudflare existente.
- Se elimina la consulta NestJS `GET /productos` en modo Supabase.
- Las variantes se obtienen del mismo catálogo autorizado por sucursal, sin llamar `GET /productos/:id/variantes` a NestJS.
- Se normalizan código, unidad, stock, costo promedio, variantes y stock/costo por variante.
- En modos distintos de Supabase se conserva la integración previa.
- No se crea ni modifica inventario; la escritura sigue realizándose por la RPC transaccional de recepción.

## Validación local
- Pruebas de contrato de integración de productos/variantes.
- `node --check` de la función Edge.
- Transpilación TypeScript/TSX.
- Integridad del ZIP.

## Pendiente
- Build integral y typecheck completo.
- Validar esquema y catálogo en Supabase staging.
- Pruebas manuales de compra con productos simples y variantes.
- No se ejecutaron migraciones ni despliegues.
