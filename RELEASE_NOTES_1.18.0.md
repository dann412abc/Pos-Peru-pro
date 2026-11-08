# Mi Carrito POS 1.18.0

## Compras y recepción por variantes
- Compras acepta líneas con `varianteId`.
- Conversión de cajas, paquetes, docenas y otros empaques a unidades de inventario (ejemplo: 10 cajas × 12 = 120 unidades).
- El costo total por empaque se convierte en costo unitario y queda guardado junto con la información del empaque.
- Recepción actualiza stock, lote y costo promedio por variante.
- Anulación de compras y devoluciones a proveedores conservan el vínculo con la variante.
- UI de compras carga y exige la presentación de las familias con variantes.
- Detalle de compra y devolución muestra la presentación.

## Base de datos
- Migración 0015 incluida para los vínculos de variantes en compra y devolución.
- No ejecutar todavía: requiere revisión y aprobación del usuario.

## Infraestructura y seguridad
- Se mantiene Supabase PostgreSQL + Cloudflare.
- No se ejecutaron migraciones.
- No hubo cambios en Supabase remoto ni despliegue a Cloudflare.
- ZIP sin `node_modules`, secretos ni archivos `.env`.
