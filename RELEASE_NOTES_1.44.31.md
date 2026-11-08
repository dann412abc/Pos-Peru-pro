# Mi Carrito POS v1.44.31

## Bloque: protección del flujo de cobro en modo Supabase

- Se bloquea explícitamente el envío de ventas desde Venta Rápida al endpoint NestJS cuando `VITE_AUTH_PROVIDER=supabase`.
- Se bloquea también el guardado de esas ventas en la cola offline heredada, que sincroniza contra la API anterior.
- El mensaje informa que la venta no fue registrada ni enviada a NestJS y conserva el carrito para evitar pérdida de datos.
- El modo tradicional/demo conserva su comportamiento.

## Motivo

El registro transaccional Supabase todavía no está implementado ni validado. Permitir que el modo Supabase cobre a través de NestJS mezclaría dos fuentes de verdad y podría dejar pagos, inventario y caja inconsistentes. Este bloque es una protección temporal, no la implementación del cobro Supabase.

## Pendiente

Implementar y probar una RPC transaccional Supabase que registre comprobante, líneas, pagos mixtos, vuelto, crédito/cuentas por cobrar, inventario por producto/variante, lotes FEFO, movimientos de caja, correlativo e idempotencia. Después se conectará Venta Rápida a esa RPC y se retirará esta protección.

No se ejecutó SQL, no se modificó Supabase remoto y no se desplegó Cloudflare.
