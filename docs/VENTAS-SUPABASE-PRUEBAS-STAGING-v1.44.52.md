# Pruebas de integración de ventas en Supabase staging — v1.44.79

Este paquete incorpora un arnés opt-in para probar la RPC `pos_registrar_venta_fefo_auth` contra una base PostgreSQL/Supabase de staging. No se conecta automáticamente y no se ejecuta durante la suite estática.

## Seguridad de ejecución

Se requieren simultáneamente:

- `POS_SALES_STAGING_CONFIRM=YES`
- `POS_SALES_FIXTURE=/ruta/absoluta/fixture.json`
- `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` y, para Supabase, `PGPORT` y `PGSSLMODE=require`.

El arnés inicia transacciones y revierte los escenarios normales al terminar. No ejecutar contra producción. Usar exclusivamente una base de staging con datos de prueba, caja abierta de prueba, productos y lotes dedicados.

La prueba de concurrencia confirma una venta de prueba para que la segunda sesión pueda comprobar el replay idempotente. Por eso exige además `POS_SALES_ALLOW_COMMIT_TESTS=YES`; el comprobante de prueba queda persistido y debe limpiarse mediante el procedimiento administrativo de staging, no mediante borrados manuales de tablas contables.

## Fixture esperado

Crear localmente un JSON que no se suba al repositorio. Ejemplo de estructura (reemplazar todos los valores):

```json
{
  "authUserId": "UUID-DE-SUPABASE-AUTH",
  "successCases": [
    {
      "name": "efectivo con producto base",
      "empresaId": 1,
      "sucursalId": 1,
      "stock": { "productId": 10, "delta": 1 },
      "expected": { "paymentCount": 1, "fefoLotCodes": ["STG-COMPRA-001"], "lotAvailabilityAfterSale": [{ "code": "STG-COMPRA-001", "available": 9 }] },
      "payload": {
        "tipo": "03",
        "idempotencyKey": "STAGING-CASH-000001",
        "sucursalId": 1,
        "clienteId": 1,
        "lineas": [
          { "productoId": 10, "cantidad": 1, "descuento": 0 }
        ],
        "pagos": [
          { "metodo": "EFECTIVO", "monto": 11.8, "montoRecibido": 20 }
        ],
        "descuentoGlobal": 0
      }
    }
  ],
  "rollbackCase": {
    "empresaId": 1,
    "sucursalId": 1,
    "stock": { "productId": 10 },
    "payload": {
      "tipo": "03",
      "idempotencyKey": "STAGING-ROLLBACK-0001",
      "sucursalId": 1,
      "clienteId": 1,
      "lineas": [
        { "productoId": 10, "cantidad": 2, "descuento": 0 }
      ],
      "pagos": [
        { "metodo": "EFECTIVO", "monto": 23.6 }
      ],
      "descuentoGlobal": 0
    },
    "expectedError": "SALE_FEFO_STOCK_MISMATCH"
  }
}
```

El ejemplo es ilustrativo, no un fixture válido listo para ejecutar. Los IDs, precios, cantidades, pagos y lotes deben coincidir con datos reales de staging. Para probar crédito, incluir `creditCustomerId`, `expected.creditDelta` y un pago `CREDITO`. Para variantes, usar `stock.variantId`. Para FEFO, incluir `expected.fefoLotIds` o `expected.fefoLotCodes` en el orden esperado.

### Flujo integrado compra → lote → venta

Un escenario de `successCases` puede incluir `purchasePrerequisite`. El runner recibirá primero esa compra con `pos_compra_recibir_auth`, comprobará que quedó `RECIBIDA` y que creó sus lotes con disponibilidad completa; luego ejecutará la venta con `pos_registrar_venta_fefo_auth` en la misma transacción y conexión. La venta debe utilizar el mismo producto/variante y sucursal que la compra. Ejemplo de estructura adicional:

```json
{
  "purchasePrerequisite": {
    "payload": { "sucursalId": 1, "proveedorId": 20, "tipoDocumento": "03", "serie": "B001", "numero": "STG-COMPRA-VENTA-01", "fechaDocumento": "2026-11-09", "condicionPago": "CONTADO", "idempotencyKey": "STG-PURCHASE-FLOW-001", "lineas": [{ "productoId": 10, "varianteId": null, "cantidad": 10, "unidadesPorEmpaque": 1, "costoUnitario": 8, "tipoIgv": 10, "codigoLote": "STG-COMPRA-001", "fechaVencimiento": "2027-12-31" }], "pagos": [{ "metodoPago": "TRANSFERENCIA", "monto": 94.40, "referencia": "STG-TRANSFER-01" }] },
    "expected": { "lotCount": 1, "lotCodes": ["STG-COMPRA-001"] }
  }
}
```

Este bloque se añade dentro de un escenario de venta que comparta `empresaId`, `sucursalId` y `stock.productId=10`; el payload de venta debe vender una cantidad menor o igual a 10. Ajustar el monto del pago a la suma real de la compra y mantener una clave idempotente única. `expected.lotAvailabilityAfterSale` debe reflejar la cantidad que quede del lote después de la venta.

## Ejecución

Desde `backend/`:

```bash
npm install
POS_SALES_STAGING_CONFIRM=YES \
POS_SALES_FIXTURE=/ruta/fixture.json \
PGHOST=... PGPORT=5432 PGDATABASE=... PGUSER=... PGPASSWORD=... \
PGSSLMODE=require \
npm run test:sales:staging
```

Para habilitar la prueba que confirma una única venta idempotente de concurrencia:

```bash
POS_SALES_ALLOW_COMMIT_TESTS=YES
```

La conexión de pruebas debe poder ejecutar `SET LOCAL ROLE authenticated`; se usa ese rol al invocar la RPC y se restaura el rol de conexión para consultar snapshots de verificación sin depender de políticas SELECT del usuario.

La suite verifica comprobante, pagos, suma pagada, stock, asignaciones FEFO y saldo por lote, saldo de crédito, ledger de caja, replay idempotente y rollback de un error FEFO. Cuando se define `purchasePrerequisite`, también verifica compra recibida y consumo del lote recién creado en la misma transacción. Los escenarios exitosos normales se revierten al final de cada prueba.

## Límites

- La suite no crea usuarios, empresas, sucursales, cajas, productos, clientes ni lotes.
- No ejecuta migraciones ni modifica políticas RLS.
- No reemplaza pruebas de carga, revisión manual de seguridad ni validación de comprobantes SUNAT.
- No habilita el botón Cobrar ni autoriza un despliegue.
