# Mi Carrito POS v1.44.32

## Bloque: auditoría del registro transaccional de ventas Supabase

- Documentado el flujo transaccional requerido para venta con productos y variantes, caja, IGV, pagos, crédito, inventario FEFO e idempotencia.
- Identificados los puntos de incompatibilidad entre el servicio NestJS y el esquema Supabase actual.
- Definidos los criterios obligatorios para retirar la protección temporal del cobro Supabase.
- Se conserva la protección de v1.44.31: en modo Supabase no se registra venta vía NestJS ni cola offline heredada.

## Pendiente

Esta versión **no habilita cobros Supabase**. No incluye una RPC de venta ejecutable ni una migración SQL para instalar. No se ejecutó SQL ni se desplegó Cloudflare. La implementación transaccional y su validación en staging son el siguiente bloque.
