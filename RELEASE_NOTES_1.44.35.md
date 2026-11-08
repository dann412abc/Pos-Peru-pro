# Mi Carrito POS v1.44.35

- Documenta el contrato de la futura RPC transaccional `pos_venta_crear_auth` a partir de las migraciones reales y del motor IGV vigente.
- Define el ámbito de identidad, esquema de pagos, stock por variante, lotes FEFO, crédito, correlativos e idempotencia concurrente.
- Identifica una incompatibilidad real: `comprobante.tipo` no admite nota de venta; se requiere numeración/registro interno separado antes de habilitar ese documento en el cobro Supabase.
- No crea ventas ni modifica inventario.
- No ejecuta migraciones, no modifica Supabase remoto y no despliega Cloudflare.
- El cobro Supabase permanece protegido. Esta versión es un avance de especificación técnica, no una habilitación de producción.
