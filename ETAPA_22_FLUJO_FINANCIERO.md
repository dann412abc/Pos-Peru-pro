# Etapa 22 — Flujo financiero diario

Versión: 1.22.0

## Implementado
- Endpoint administrativo `GET /api/caja/reportes/flujo`.
- Filtro por sucursal y rango de fechas.
- Ingresos de ventas calculados desde `comprobante_pago` y la fecha de emisión del comprobante.
- Otros ingresos y salidas a partir de `caja_movimiento`.
- Resumen de ingresos, salidas y flujo neto diario.
- Vista integrada en Reportes con totales del periodo y detalle por día.
- Respeta la empresa y las sucursales asignadas al usuario.

## Criterios y límites
- El flujo neto es un indicador de caja, no utilidad contable ni estado de resultados.
- Solo aparecen salidas registradas como movimientos de caja. Gastos pagados fuera de caja no se reflejan.
- Las ventas anuladas se excluyen.
- Las compras pagadas a través de movimientos de caja quedan incluidas como salidas.
- No se añade una migración porque se reutilizan `comprobante_pago` y `caja_movimiento`.

## Pendiente de validación
- Ejecutar pruebas de integración contra PostgreSQL con datos reales.
- Confirmar el criterio de fecha contable para cierres, pagos retroactivos y devoluciones.
- Implementar catálogo de categorías de gastos y un estado de resultados formal en una etapa posterior.

## Operación
No se ejecutaron migraciones, no se modificó Supabase y no se desplegó Cloudflare.
