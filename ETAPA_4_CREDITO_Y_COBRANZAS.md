# Mi Carrito POS v1.4.1 — Etapa 4: Crédito y cobranzas

## Funcionalidad implementada

- Distribución de una venta entre pagos inmediatos y crédito; la suma de medios debe coincidir con el total.
- El componente de crédito —no el total de la venta— consume el límite y saldo del cliente.
- Bloqueo transaccional del cliente durante la validación del límite para evitar sobrepasarlo con ventas concurrentes.
- Cuenta por cobrar por comprobante, con vencimiento por defecto a 30 días y fecha editable mediante API.
- Aplicación de abonos parciales y totales con clave idempotente.
- Historial de cobranzas por cuenta, medio, fecha, referencia y usuario.
- Ingreso a caja enlazado al comprobante y al cobro para efectivo, tarjeta, Yape y Plin.
- Transferencias bancarias registradas en el historial sin alterar el efectivo físico de caja.
- Reconciliación del saldo global del cliente con las cuentas abiertas al migrar.
- Dashboard de cartera: vigente, 1–7, 8–30, 31–60 y más de 60 días vencidos.
- La anulación simple de una venta con cobranza aplicada queda bloqueada para impedir que se pierda un ingreso; requiere flujo formal de devolución/regularización.

## Migración

Nueva migración: `backend/src/database/migrations/1700000000005-cuentas-cobrar-cobranzas.ts`.

1. Hacer respaldo consistente de PostgreSQL.
2. Confirmar que las migraciones 0000 a 0004 ya están aplicadas.
3. Configurar el backend con acceso a PostgreSQL.
4. Ejecutar desde `backend`: `npm ci` y `npm run migration:run`.
5. Desplegar backend y frontend v1.4.1 juntos.

La migración reconstruye cuentas abiertas desde las filas `comprobante_pago` con método `CREDITO` y recalcula `cliente.saldo_credito` como suma de saldos de cuentas no anuladas. Por eso, no debe ejecutarse sobre un esquema ajeno o sin respaldo.

## API

- `GET /api/clientes/cuentas-por-cobrar?sucursalId=1`
- `GET /api/clientes/cuentas-por-cobrar/resumen?sucursalId=1`
- `GET /api/clientes/cuentas-por-cobrar/:id`
- `POST /api/clientes/cuentas-por-cobrar/:id/cobros`

Ejemplo de cobro:

```json
{
  "metodoPago": "YAPE",
  "monto": 20.00,
  "referencia": "OP-123456",
  "idempotencyKey": "collection-unique-key-0001"
}
```

## Restricciones conocidas

- No se implementa aún una conciliación automática con el banco para transferencias: se registra la referencia proporcionada por el operador.
- La anulación de una venta con abonos recibidos se bloquea; falta el módulo de devolución al cliente para reembolsar esos importes con trazabilidad completa.
- El módulo no calcula intereses ni penalidades moratorias.
- La integración de firma digital y envío SUNAT/OSE sigue siendo simulada.
- Compilación integral, migración sobre PostgreSQL de prueba y pruebas de extremo a extremo deben ejecutarse en el entorno de despliegue con servicios reales.

## Endurecimiento v1.4.1

- Se corrigió la integridad referencial de `cobro_cliente`: la migración crea la clave única `(id, sucursal_id, empresa_id)` en la cuenta y exige que cuenta, sucursal y caja coincidan en las claves foráneas compuestas.
- La migración actualiza los comprobantes históricos con saldo a crédito a estado `PENDIENTE`.
- Las claves foráneas compuestas obligan a que cuenta, cobranza, sucursal y caja pertenezcan a la misma sucursal/empresa; la base también impide una cuenta pagada o anulada con saldo residual.
- Los vencimientos y reportes de morosidad usan la fecha local de `America/Lima`, sin depender de la zona horaria del servidor PostgreSQL.
- Se mantiene exactamente el saldo de S/ 0.01: la cuenta no se marca pagada hasta que el saldo sea cero.
- La clave idempotente de cobranza se compara contra cuenta, importe, método y referencia. Un bloqueo asesor de transacción serializa solicitudes simultáneas con la misma clave; reutilizarla con datos distintos produce conflicto, no una falsa confirmación.
- Los conflictos HTTP 409 liberan la clave local (son definitivos); los timeouts, 408, 429 y 5xx conservan el mismo intento para consultar/reintentar sin duplicar.
- La anulación simple queda bloqueada ante cualquier importe cobrado, incluso S/ 0.01.
- El resumen de caja muestra el saldo a crédito aún pendiente, reduciéndolo conforme se registran cobranzas para no duplicar el mismo importe entre crédito y medios de pago.
- El frontend conserva la misma clave de operación en almacenamiento local ante timeout o respuesta 5xx y obliga a reintentar el mismo cuerpo hasta confirmar el resultado.
- La pantalla de venta permite elegir la fecha de vencimiento del crédito (por defecto, 30 días) y bloquea la venta a crédito cuando el dispositivo está sin conexión.
- La edición de clientes actualiza únicamente los campos del formulario para no sobrescribir el saldo de crédito modificado por una venta o cobranza concurrente.
- La ficha de clientes muestra límite, saldo utilizado y crédito disponible.

## Comprobaciones de v1.4.1

- 150 archivos fuente TypeScript/TSX inspeccionados por el analizador sintáctico: cero errores sintácticos (se excluyó el archivo declarativo de Vite).
- 15 aserciones de lógica de crédito e idempotencia ejecutadas con Node: 15/15 correctas.
- La compilación integral con npm, la migración contra una instancia PostgreSQL limpia y las pruebas de extremo a extremo todavía deben ejecutarse en el entorno que tenga las dependencias y base de datos. Esta entrega no se declara lista para producción hasta completar esas verificaciones.

**Atención a la migración:** hacer respaldo antes de ejecutar. Confirmar que `1700000000005` no figure ya como aplicada. Si una ejecución anterior falló y dejó tablas/objetos parciales fuera de una transacción, detenerse y revisar el esquema antes de volver a ejecutar; no borrar tablas manualmente en una base con datos operativos.
