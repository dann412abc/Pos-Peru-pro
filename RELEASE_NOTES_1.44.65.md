# Mi Carrito POS 1.44.65

## Conciliación de devoluciones en caja
- El resumen autenticado descuenta los reembolsos por su medio real (efectivo, tarjeta, Yape o Plin).
- El efectivo esperado resta únicamente reembolsos en efectivo.
- `totalDevoluciones` refleja las devoluciones registradas del turno.
- El historial persistente muestra cada reembolso como salida con su método y referencia de devolución.
- Los reembolsos no se vuelven a descontar como movimientos manuales, evitando duplicidad.

## Seguridad y despliegue
- Reemplazos SQL incluidos solo en `supabase/migrations-preview/`.
- No se ejecutó SQL remoto ni se desplegó Cloudflare.
- Validar la estructura de `devolucion_venta`, `devolucion_venta_pago` y `caja_movimiento` en staging antes de aplicar.
