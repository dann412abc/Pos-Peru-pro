# Etapa 24 — Estado de resultados operativo

Versión: 1.24.0

## Implementado
- Endpoint administrativo `GET /api/gastos/reportes/estado-resultados`.
- Filtros por sucursal y periodo, con aislamiento por empresa.
- Ventas netas sin IGV calculadas desde comprobantes no anulados.
- Devoluciones registradas reducen proporcionalmente ventas y cantidades vendidas.\n- Las notas de crédito (tipo 07) se reflejan como importes negativos y las notas de débito (tipo 08) como importes positivos.
- Costo de mercadería calculado desde el costo histórico guardado en las líneas de venta y ajustado por devoluciones.
- Gastos operativos incluidos por fecha del gasto (base de devengo), estén pendientes o pagados.
- Resumen y detalle diario: ventas netas, ventas sin costo, costo, utilidad bruta, gastos y utilidad operativa parcial.
- Desglose de gastos por categoría.
- Alerta de ventas sin costo; estas líneas se excluyen de la utilidad bruta/operativa para evitar presentar una utilidad artificialmente alta.
- Exportación CSV compatible con Excel.
- Sin migración nueva: reutiliza comprobantes, devoluciones y `gasto_operativo` de etapa 23.

## Criterios y limitaciones contables
- La utilidad bruta solo considera líneas con costo registrado. Las ventas sin costo se reportan separadamente y requieren completar costos.
- La utilidad operativa es parcial: no incluye depreciación, intereses, impuesto a la renta, ajustes contables, provisiones ni conciliación bancaria.
- Los gastos se reconocen por fecha del gasto, no por fecha de pago; el flujo de caja se mantiene como reporte separado.
- Las ventas se expresan sobre base imponible (sin IGV). La consistencia de costo sin IGV depende del tipo de IGV y de cómo se capturó el costo de compra.
- Este reporte es gerencial y no reemplaza los libros contables ni la declaración tributaria.

## Pendiente
- Pruebas de integración contra PostgreSQL real y conciliación con cierres de caja.
- Validar reglas tributarias y contables con contador peruano.
- Exportación PDF y comparativos mensuales multi-sucursal.

No se ejecutaron migraciones, no se modificó Supabase y no se desplegó Cloudflare.
