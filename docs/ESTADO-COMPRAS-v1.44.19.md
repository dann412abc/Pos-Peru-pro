# Estado del módulo Compras — v1.44.19

## Operaciones con ruta Supabase + Cloudflare preparadas
- Proveedores: consulta y mantenimiento (según migraciones preview previas).
- Recepción de compras: ruta Edge + RPC transaccional preview.
- Historial y detalle: ruta Edge + RPC de lectura preview.
- Pagos posteriores: ruta Edge + RPC transaccional preview.
- Devolución a proveedor: ruta Edge + RPC transaccional preview (esta versión).

## Devolución a proveedor
La pantalla de detalle invoca `POST /api/edge/purchases/return` en modo Supabase. La RPC valida usuario/empresa/sucursal, compra recibida, motivo, cantidades adquiridas, devoluciones previas, stock, lotes y clave idempotente. Registra cabecera y líneas, descuenta lotes y stock, recalcula costo promedio y registra movimiento de inventario; aplica el importe primero al saldo de la compra y deja el excedente como saldo a favor.

## No considerar todavía módulo Compras cerrado
Pendiente: anulaciones completas en Supabase, órdenes de compra y recepciones parciales, reportes/analítica de proveedores, y lectura real de cajas abiertas para los formularios que requieren caja. Falta build integral y pruebas contra PostgreSQL/Supabase staging.

## Operaciones no realizadas
No se ejecutó ninguna migración en el proyecto del usuario, no se modificó la base remota y no se desplegó Cloudflare.
