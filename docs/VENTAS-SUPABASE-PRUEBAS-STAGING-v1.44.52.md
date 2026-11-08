# Pruebas de integración de ventas en Supabase staging — v1.44.52

Este paquete incorpora un arnés opt-in para probar la RPC `pos_venta_crear_auth` contra una base PostgreSQL/Supabase de staging. No se conecta automáticamente y no se ejecuta durante la suite estática.

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
      "expected": { "paymentCount": 1, "fefoLotIds": [101] },
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
    "expectedError": "SALE_FEFO_LOTS_INSUFFICIENT_OR_EXPIRED"
  }
}
```

El ejemplo es ilustrativo, no un fixture válido listo para ejecutar. Los IDs, precios, cantidades, pagos y lotes deben coincidir con datos reales de staging. Para probar crédito, incluir `creditCustomerId`, `expected.creditDelta` y un pago `CREDITO`. Para variantes, usar `stock.variantId`. Para FEFO, incluir `expected.fefoLotIds` en el orden esperado.

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

La suite verifica comprobante, pagos, suma pagada, stock, asignaciones FEFO, saldo de crédito, ledger de caja, replay idempotente y rollback de un error FEFO. Los escenarios exitosos normales se revierten al final de cada prueba.

## Límites

- La suite no crea usuarios, empresas, sucursales, cajas, productos, clientes ni lotes.
- No ejecuta migraciones ni modifica políticas RLS.
- No reemplaza pruebas de carga, revisión manual de seguridad ni validación de comprobantes SUNAT.
- No habilita el botón Cobrar ni autoriza un despliegue.
