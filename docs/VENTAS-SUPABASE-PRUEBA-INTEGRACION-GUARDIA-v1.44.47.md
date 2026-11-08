# v1.44.47 — Kit de integración PostgreSQL para la barrera de ventas

## Objetivo

Preparar una prueba ejecutable en PostgreSQL/Supabase staging que demuestre que la RPC `pos_venta_transaccion_guardia_auth(jsonb)` rechaza la escritura y no altera datos operativos. Esta etapa **no implementa todavía el escritor transaccional de ventas**.

## Archivos

- `supabase/migrations-preview/202611070032_sales_writer_guard_staging_integration.sql`: harness psql reversible.
- `supabase/migrations-preview/202611070032_sales_writer_guard_staging_integration.test.mjs`: pruebas estáticas del harness.

## Requisitos de staging

1. Base de datos aislada, con el esquema completo de la aplicación y las funciones preview anteriores aplicadas manualmente en un entorno de pruebas.
2. Sesión `psql` conectada como `postgres` o rol con permiso para `SET ROLE authenticated`.
3. Un UUID real de `auth.users` asociado a un usuario POS activo, con sucursal asignada, caja abierta, cliente y producto con stock suficiente.
4. Payload válido con `sucursalId`, `clienteId`, `idempotencyKey`, `lineas` y `pagos` conforme al contrato documentado.
5. No debe haber otros procesos escribiendo en esas tablas durante la prueba: el harness compara huellas globales y cualquier escritura concurrente invalida el resultado.

## Ejecución manual — solo staging

```bash
psql "$STAGING_DATABASE_URL" \
  -v auth_user_id='UUID_REAL_DE_AUTH_USERS' \
  -v sale_payload='{"sucursalId":1,"clienteId":1,"idempotencyKey":"staging-guard-test-001","lineas":[{"productoId":1,"cantidad":1,"descuento":0}],"pagos":[{"metodo":"EFECTIVO","monto":10}]}' \
  -f supabase/migrations-preview/202611070032_sales_writer_guard_staging_integration.sql
```

El JSON del ejemplo es ilustrativo: reemplazar IDs, total y producto por registros válidos del staging. La prevalidación reconstruye el precio desde catálogo; no se debe asumir que el importe `10` coincide con el total real.

## Criterio de aprobación

- La función devuelve `ok=false`, `decision=WRITER_DISABLED` y `code=SALE_TRANSACTIONAL_WRITER_NOT_READY`.
- Los indicadores `saleCreated`, `paymentsCreated`, `inventoryChanged`, `cashMovementCreated`, `receivableCreated` y `correlativoConsumed` son `false`.
- No cambian cantidad ni contenido de diez tablas: comprobantes, líneas, pagos, movimientos de inventario, salidas FEFO, cuentas por cobrar, movimientos de caja, stock base, stock de variantes y correlativos.
- El script termina con `ROLLBACK`; no deja cambios de la sesión.

## Limitaciones

No se pudo ejecutar esta prueba aquí: no hay conexión a PostgreSQL/Supabase staging ni `psql` disponible en el entorno de construcción. Las pruebas Node.js incluidas son estáticas y solo verifican el contenido/contrato del harness. No afirmar que el SQL pasó en runtime.

El snapshot de contenido es global a cada tabla; por eso debe usarse exclusivamente en un staging aislado y sin escrituras concurrentes. No ejecutar en producción. No aplicar migraciones ni habilitar Cobrar como consecuencia de esta entrega.
