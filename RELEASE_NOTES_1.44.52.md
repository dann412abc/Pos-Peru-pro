# Mi Carrito POS v1.44.52

- Añade arnés de integración opt-in para `pos_venta_crear_auth` en PostgreSQL/Supabase staging.
- Verifica creación de comprobante, pagos, stock, FEFO, crédito y ledger de caja.
- Verifica replay idempotente sin duplicar cambios.
- Verifica rollback tras un error de asignación FEFO insuficiente.
- Añade escenario concurrente de dos sesiones; requiere opt-in separado porque confirma un comprobante de prueba en staging.
- No crea fixtures, no ejecuta migraciones, no se conecta automáticamente y no modifica producción.
- No habilita Cobrar ni despliega a Cloudflare.
