# Mi Carrito POS v1.44.16

## Compras: historial y detalle conectados a Supabase + Cloudflare

- Nueva RPC preview `pos_compras_consultar_auth(p_sucursal_id, p_compra_id)` para historial y detalle.
- La empresa y usuario se derivan de `auth.uid()`; la sucursal se valida contra las sucursales asignadas al usuario.
- Nuevo endpoint `GET /api/edge/purchases` con validación de sesión y parámetros.
- El historial de compras y el detalle de compra usan la nueva API cuando `VITE_AUTH_PROVIDER=supabase`.
- Se incluyen líneas, variante, empaque, lote, vencimiento y pagos registrados en el detalle.
- El historial está limitado a las 250 compras más recientes de la sucursal.
- El backend NestJS se mantiene como ruta para el resto de operaciones que todavía no se migraron.

## Estado real

- Historial y detalle: conectados a la API nueva, pendientes de instalar/probar la RPC en staging. La RPC requiere el esquema de compras y las migraciones previas de variantes y vencimientos.
- Recepción: conectada desde v1.44.15, depende de la RPC de recepción en preview.
- Pagos posteriores, devoluciones al proveedor, anulación, órdenes, análisis y reposición: todavía dependen de NestJS.
- No se ejecutó SQL, no se modificó Supabase remoto ni se desplegó Cloudflare.

## Validación local

- 9 pruebas Node de contratos UI y endpoints de lectura/recepción: aprobadas.
- Sintaxis JavaScript Edge: correcta.
- Transpilación sintáctica de Compras.tsx y supabasePurchases.ts: 0 diagnósticos.
- Build integral Vite/TypeScript y prueba real PostgreSQL/Supabase: pendientes.
- Build integral y prueba real PostgreSQL/Supabase: pendientes.
