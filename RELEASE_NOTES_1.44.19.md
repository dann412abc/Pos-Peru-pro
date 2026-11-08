# Mi Carrito POS v1.44.19

## Compras: devolución definitiva a proveedor

- Se incorpora la RPC preview `pos_compra_devolucion_registrar_auth`.
- Registra la devolución en una única transacción PostgreSQL: cabecera, líneas, lotes, stock por producto/variante, costo promedio, movimiento de inventario y aplicación al saldo pendiente/saldo a favor.
- Incluye bloqueo de compra y lotes, control de cantidad adquirida/devoluciones previas, validación de stock, motivo obligatorio, autorización por empresa/sucursal e idempotencia.
- Se añade `POST /api/edge/purchases/return` con validación de payload y JWT Supabase.
- El botón Devolver del detalle de compra usa la RPC cuando `VITE_AUTH_PROVIDER=supabase`; NestJS se conserva como ruta para el modo anterior.

## Pendiente de validación

- Revisar el SQL contra el esquema real de staging y ejecutar pruebas transaccionales en PostgreSQL.
- Confirmar las migraciones previas de lotes, variantes y costo promedio instaladas.
- No se ejecutó SQL remoto ni se desplegó Cloudflare.
- Build integral pendiente; pruebas unitarias de la ruta Edge cubren autenticación, payload, duplicados y RPC ausente.
