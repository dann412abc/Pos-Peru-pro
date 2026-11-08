# Mi Carrito POS v1.44.24

## Compras — Reposición sugerida
- La pestaña Reposición sugerida consulta Supabase + Cloudflare cuando `VITE_AUTH_PROVIDER=supabase`.
- RPC preview `pos_compras_sugerencias_reposicion_auth(integer)`, aislada por usuario, empresa y sucursal.
- Considera productos simples y variantes, salidas de venta de 30 días, stock actual, stock mínimo, cobertura objetivo de 14 días, costo promedio e último proveedor.
- Es una consulta de solo lectura: no crea órdenes ni modifica inventario.

## Verificación
- 7 pruebas de contrato aprobadas.
- `node --check` del router Edge aprobado.
- Transpilación TS/TSX pendiente de registrar en esta nota; no equivale a build integral.
- PostgreSQL real y staging pendientes.
