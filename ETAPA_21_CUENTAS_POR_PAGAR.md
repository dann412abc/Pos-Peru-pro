# Etapa 21 — Cuentas por pagar y vencimientos de proveedores

## Objetivo
Completar el control de compras a crédito mediante fechas pactadas de pago y antigüedad de saldos.

## Implementado
- Las compras con condición CRÉDITO requieren fecha de vencimiento.
- La fecha de vencimiento no puede ser anterior a la fecha del documento.
- Las compras CONTADO no aceptan fecha de vencimiento.
- La fecha se almacena en `compra.fecha_vencimiento`.
- El endpoint `GET /api/compras/cuentas-por-pagar` expone fecha de vencimiento, días vencidos y estado: VENCIDO, VENCE_HOY, POR_VENCER o VIGENTE.
- La pantalla de compras muestra el vencimiento y el estado de cada obligación.
- Se conserva el registro existente de pagos parciales/completos, referencias y detalle histórico por compra.
- La migración rellena registros históricos de crédito con la fecha del documento para que no queden sin clasificación.

## Migración pendiente
`backend/src/database/migrations/1710000000016-cuentas-por-pagar-vencimientos.ts`

**No ejecutar hasta autorizarlo.** Esta etapa no modifica Supabase remoto ni despliega Cloudflare.

## Notas
- Para registros históricos, la fecha del documento se usa como vencimiento provisional porque el sistema anterior no guardaba el plazo pactado. Conviene revisar y ajustar esas fechas luego de aplicar la migración.
- La compilación integral y las pruebas de integración con PostgreSQL requieren instalar dependencias y disponer de una base de pruebas.
