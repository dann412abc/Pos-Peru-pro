# Estado del módulo Compras — v1.44.21

## Órdenes de compra migradas a Supabase + Cloudflare (preview)
- Listado y detalle por sucursal autorizada.
- Creación de órdenes con proveedor, productos, variantes, cantidades y costo estimado.
- Envío y cancelación con control de estado.
- Recepción parcial: valida cantidades pendientes, crea compra a crédito reutilizando `pos_compra_recibir_auth`, actualiza cantidades recibidas y estado de la orden dentro de la misma transacción PostgreSQL.
- Idempotencia por recepción y bloqueo de orden/líneas para evitar duplicidad concurrente.
- La pantalla usa estas rutas cuando `VITE_AUTH_PROVIDER=supabase`; en modo anterior conserva NestJS.

## Límites / validaciones pendientes
- La recepción de orden crea compra a crédito sin pagos iniciales, igual que el flujo previo del backend.
- Debe probarse la composición de RPCs y restricciones contra PostgreSQL staging, incluyendo migraciones base, RLS y permisos.
- Build integral y pruebas de navegador pendientes.
- No se ejecutó SQL ni se desplegó Cloudflare.
