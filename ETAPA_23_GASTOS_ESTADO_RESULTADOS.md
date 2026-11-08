# Etapa 23 — Gastos operativos y base del estado de resultados

Versión: 1.23.0

## Implementado
- Módulo de gastos operativos visible solo para ADMIN.
- Registro de gastos por sucursal, categoría, descripción, monto, medio previsto, fecha y vencimiento.
- Estados PENDIENTE y PAGADO.
- Registro separado del pago real, fecha de pago y referencia de operación.
- Prevención de doble pago mediante actualización transaccional condicionada al estado pendiente.
- Historial filtrable por periodo y resumen de importes pendientes/pagados.
- Categorías: alquiler, servicios, personal, transporte, mantenimiento, suministros, impuestos y otros.
- Reporte de flujo de caja actualizado para descontar los gastos operativos pagados, separados de las salidas manuales de caja.

## Reglas contables
- Un gasto pendiente no reduce el flujo de caja hasta registrar el pago.
- El flujo descuenta el gasto en la fecha efectiva de pago.
- El importe de gasto no se suma automáticamente al costo de mercadería ni a la utilidad bruta.
- Esta etapa no presenta todavía utilidad neta contable: para ello faltan depreciaciones, impuestos, ajustes, conciliación bancaria y reglas de devengo.
- Para evitar duplicidades, registrar cada gasto en este módulo o como salida manual de caja, no en ambos.

## Migración
`backend/src/database/migrations/1710000000017-gastos-operativos.ts`

Crea `gasto_operativo`, restricciones e índices. No se ha ejecutado.

## Pendiente de validación
- Pruebas de integración en PostgreSQL.
- Verificar permisos de administrador y aislamiento multiempresa.
- Validar el flujo con movimientos reales, pagos parciales y cierres de caja.
- Estado de resultados formal en una etapa posterior.

No se ejecutaron migraciones, no se modificó Supabase y no se desplegó Cloudflare.
