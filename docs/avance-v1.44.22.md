# Mi Carrito POS v1.44.22 — Cajas abiertas en Compras

## Alcance
- Se incorpora `pos_compras_cajas_abiertas_auth(integer)` como migración SQL de preview.
- La RPC deriva empresa y usuario desde `auth.uid()`, valida asignación de sucursal y devuelve solo cajas ABIERTAS del usuario autenticado en esa sucursal.
- Cloudflare Pages Functions expone `GET /api/edge/purchases/cash-registers?sucursalId=...` y transmite el JWT del usuario a Supabase.
- El cliente `listarCajasAbiertasComprasSupabase` valida sucursal y estructura de respuesta.
- La pantalla Compras utiliza esta consulta en modo Supabase; en modo legado conserva el endpoint NestJS.
- Si la lectura de cajas falla, la pantalla informa el problema y continúa con la lista vacía, sin fingir que existe una caja abierta.

## Validación ejecutada
- 42 pruebas Node de contratos de rutas, integración de UI y contratos SQL seleccionados: aprobadas.
- `node --check` de la función Edge: correcto.
- Transpilación TypeScript/JSX de `Compras.tsx` y `supabasePurchases.ts`: sin diagnósticos.
- ZIP verificado con `ZipFile.testzip()`.

## Pendiente
- La migración `202611070015_purchase_cash_registers_read_rpc.sql` es preview y no se ha ejecutado.
- No se ha probado contra PostgreSQL/Supabase real.
- No se ejecutó el build integral ni se desplegó Cloudflare.
- Compras todavía usa NestJS para productos, sugerencias de reposición, análisis de proveedores y vencimientos; esta versión solo elimina NestJS de la consulta de cajas abiertas en modo Supabase.
