# Pruebas transaccionales de recepción de compras en Supabase staging — v1.44.79

Este arnés opt-in ejecuta la RPC \`public.pos_compra_recibir_auth(jsonb)\` contra una base PostgreSQL/Supabase de staging. Comprueba recepción de producto base y variante, lotes, costo promedio ponderado, pagos mixtos, movimientos de caja, rollback e idempotencia.

## Seguridad y condiciones

Se requieren simultáneamente:

- \`POS_PURCHASE_STAGING_CONFIRM=YES\`
- \`POS_PURCHASE_FIXTURE=/ruta/absoluta/purchase-fixture.json\`
- \`PGHOST\`, \`PGDATABASE\`, \`PGUSER\`, \`PGPASSWORD\`
- En Supabase: \`PGPORT\` explícito y \`PGSSLMODE=require\`.

Sin ambas variables POS, el test queda omitido y no carga el driver PostgreSQL ni abre conexiones. El fixture debe mantenerse local, fuera del repositorio y fuera de los registros compartidos.

**No ejecutar contra producción.** Usar una base de staging aislada, con usuario ADMIN de prueba, proveedor activo, sucursal, caja abierta, productos, variantes y stock dedicados. El arnés no crea esos datos ni aplica migraciones.

Los casos normales se ejecutan dentro de transacciones que terminan en \`ROLLBACK\`. La prueba concurrente confirma una recepción para que la segunda sesión compruebe el replay idempotente; exige además \`POS_PURCHASE_ALLOW_COMMIT_TESTS=YES\`. Esa compra queda persistida en staging y debe limpiarse mediante el procedimiento administrativo de staging, nunca con borrados manuales de tablas contables.

## Fixture de referencia

Estructura orientativa. Sustituir todos los IDs, importes, costos y expectativas por datos reales de staging. No ejecutar el ejemplo literalmente.

\`\`\`json
{
  "authUserId": "UUID-DE-SUPABASE-AUTH-ADMIN",
  "successCases": [
    {
      "name": "producto base con pagos mixtos",
      "empresaId": 1,
      "sucursalId": 1,
      "stock": { "productId": 100, "delta": 10 },
      "expected": {
        "purchaseCount": 1,
        "purchaseLineCount": 1,
        "paymentCount": 2,
        "lotCount": 1,
        "inventoryMovementCount": 1,
        "cashMovementCount": 2,
        "averageCost": 8.5,
        "lotCodes": ["STG-BASE-001"]
      },
      "payload": {
        "sucursalId": 1,
        "proveedorId": 20,
        "tipoDocumento": "01",
        "serie": "F001",
        "numero": "STG-00001",
        "fechaDocumento": "2026-11-01",
        "condicionPago": "CONTADO",
        "idempotencyKey": "STG-PURCHASE-BASE-0001",
        "lineas": [
          {
            "productoId": 100,
            "varianteId": null,
            "cantidad": 10,
            "unidadesPorEmpaque": 1,
            "costoUnitario": 8.5,
            "tipoIgv": 10,
            "codigoLote": "STG-BASE-001",
            "fechaVencimiento": "2027-12-31",
            "unidadCompra": "UNIDAD"
          }
        ],
        "pagos": [
          { "metodoPago": "EFECTIVO", "monto": 50, "cajaId": 30 },
          { "metodoPago": "YAPE", "monto": 50, "cajaId": 30 }
        ]
      }
    },
    {
      "name": "variante con conversión de empaque",
      "empresaId": 1,
      "sucursalId": 1,
      "stock": { "productId": 200, "variantId": 900, "delta": 24 },
      "expected": {
        "purchaseCount": 1,
        "purchaseLineCount": 1,
        "paymentCount": 1,
        "lotCount": 1,
        "inventoryMovementCount": 1,
        "cashMovementCount": 0,
        "averageCost": 3.25,
        "lotCodes": ["STG-VAR-001"]
      },
      "payload": {
        "sucursalId": 1,
        "proveedorId": 20,
        "tipoDocumento": "03",
        "serie": "B001",
        "numero": "STG-00002",
        "fechaDocumento": "2026-11-01",
        "condicionPago": "CONTADO",
        "idempotencyKey": "STG-PURCHASE-VAR-0001",
        "lineas": [
          {
            "productoId": 200,
            "varianteId": 900,
            "cantidad": 2,
            "unidadesPorEmpaque": 12,
            "costoEmpaque": 39,
            "tipoIgv": 10,
            "codigoLote": "STG-VAR-001",
            "fechaVencimiento": "2027-10-31",
            "unidadCompra": "CAJA"
          }
        ],
        "pagos": [
          { "metodoPago": "TRANSFERENCIA", "monto": 92.04, "referencia": "STAGING-TRANSFER-001" }
        ]
      }
    }
  ],
  "rollbackCase": {
    "empresaId": 1,
    "sucursalId": 1,
    "stock": { "productId": 100 },
    "expectedError": "PURCHASE_CASH_NOT_ENOUGH",
    "payload": {
      "sucursalId": 1,
      "proveedorId": 20,
      "tipoDocumento": "01",
      "serie": "F001",
      "numero": "STG-ROLLBACK-001",
      "fechaDocumento": "2026-11-01",
      "condicionPago": "CONTADO",
      "idempotencyKey": "STG-PURCHASE-ROLLBACK-01",
      "lineas": [
        {
          "productoId": 100,
          "varianteId": null,
          "cantidad": 1,
          "unidadesPorEmpaque": 1,
          "costoUnitario": 1000,
          "tipoIgv": 10,
          "codigoLote": "STG-ROLLBACK-LOT"
        }
      ],
      "pagos": [
        { "metodoPago": "EFECTIVO", "monto": 1180, "cajaId": 30 }
      ]
    }
  }
}
\`\`\`

Los importes del ejemplo son ilustrativos: el total pagado debe coincidir con el total de compra en los casos CONTADO. El pago Yape y el efectivo usan la misma caja abierta; la transferencia no lleva \`cajaId\` ni genera movimiento de caja. El costo promedio esperado debe calcularse con el stock y costo promedio iniciales del registro de stock elegido.

Para un caso de crédito, usar \`condicionPago: "CREDITO"\`, una \`fechaVencimiento\` igual o posterior a la fecha del documento y \`pagos: []\`; la RPC no admite pago inicial en esa condición. Para verificar costo promedio con histórico NULL, preparar ese valor en staging antes del test y calcular la expectativa sobre ese fixture.

## Ejecución

Desde \`backend/\`:

\`\`\`bash
npm install
POS_PURCHASE_STAGING_CONFIRM=YES \\
POS_PURCHASE_FIXTURE=/ruta/absoluta/purchase-fixture.json \\
PGHOST=... PGPORT=5432 PGDATABASE=... PGUSER=... PGPASSWORD=... \\
PGSSLMODE=require \\
npm run test:purchases:staging
\`\`\`

La prueba verifica:
- identidad de empresa, sucursal y proveedor;
- cabecera y estado RECIBIDA;
- líneas, unidades convertidas y lotes creados;
- incremento exacto de stock y costo promedio ponderado;
- pagos individuales y suma pagada;
- movimientos de inventario y de caja;
- reintento con la misma clave sin duplicar efectos;
- rollback integral ante caja insuficiente.

Para habilitar el escenario concurrente persistente, añadir explícitamente:

\`\`\`bash
POS_PURCHASE_ALLOW_COMMIT_TESTS=YES
\`\`\`

El caso concurrente requiere \`concurrencyCase\` en el fixture con \`expected.purchaseCount\`, \`purchaseLineCount\`, \`paymentCount\`, \`lotCount\`, \`inventoryMovementCount\`, \`cashMovementCount\` y, opcionalmente, \`stock.delta\` y \`averageCost\`.

## Límites

- No crea usuarios, empresas, sucursales, proveedores, cajas, productos, variantes ni lotes.
- No instala ni ejecuta migraciones.
- No modifica políticas RLS ni datos de producción.
- La prueba no reemplaza validación de documentos tributarios/SUNAT ni una prueba manual del flujo desde la interfaz.
