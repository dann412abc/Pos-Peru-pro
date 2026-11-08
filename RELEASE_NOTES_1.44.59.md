# Mi Carrito POS v1.44.59

## Concurrencia e idempotencia de cobros
- Refuerza el escenario opt-in de dos sesiones PostgreSQL que intentan registrar la misma venta simultáneamente.
- La segunda sesión espera el bloqueo transaccional de idempotencia y debe recuperar el comprobante confirmado por la primera.
- Amplía las aserciones para comprobar que comprobante, pagos, movimientos de inventario, salidas FEFO, movimientos de caja, stock y crédito se aplican exactamente una vez.
- Añade una prueba estática para proteger estas aserciones del arnés de staging.

## Límites de seguridad
- La prueba concurrente requiere `POS_SALES_STAGING_CONFIRM=YES`, fixture y `POS_SALES_ALLOW_COMMIT_TESTS=YES`.
- Solo debe ejecutarse en una base de staging aislada con datos descartables. No ejecutar contra producción.
- No se ejecutaron migraciones, no se desplegó Cloudflare y los cobros Supabase continúan deshabilitados.
- El caso concurrente confirma una venta de prueba en staging; debe prepararse con cantidades y efectos esperados explícitos en `fixture.concurrencyCase.expected`.
