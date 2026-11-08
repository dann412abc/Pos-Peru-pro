# Mi Carrito POS v1.44.45

- Añadida auditoría SQL de solo lectura para prerrequisitos de la futura RPC transaccional de ventas.
- Documentado el contrato de escrituras atómicas, idempotencia, bloqueos, correlativos, lotes FEFO, pagos y crédito.
- Identificada y documentada la regla de caja: los pagos de venta se contabilizan desde `comprobante_pago`; no duplicarlos en `caja_movimiento`.
- Añadidas pruebas estáticas para el alcance read-only y los requisitos transaccionales.
- No se ejecutaron migraciones ni SQL en Supabase. No se desplegó Cloudflare. Cobrar permanece sin habilitación para la RPC nueva.
