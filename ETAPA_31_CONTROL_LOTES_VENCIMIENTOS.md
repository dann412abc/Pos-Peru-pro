# Etapa 31 — Control avanzado de lotes y vencimientos

## Implementado
- Pantalla dedicada `Lotes y vencimientos` para administración.
- Filtro de horizonte de 30, 60, 90, 180 o 365 días.
- Filtros por estado y búsqueda por producto, presentación, código, lote y sucursal.
- Clasificación: vencido, vence hoy, crítico (hasta 7 días), próximo (8–15 días) y vigente (16+ días).
- Resumen de lotes vencidos, críticos, unidades y valor de inventario expuesto.
- Exportación CSV compatible con Excel.
- El reporte incluye variantes/presentaciones y utiliza el costo unitario del lote.

## Seguridad y límites
- Reutiliza el endpoint autenticado `/api/inventario/vencimientos` y las sucursales autorizadas del usuario.
- No crea ni modifica lotes, stock, movimientos o mermas.
- El valor expuesto es una estimación de cantidad disponible por costo unitario, no una pérdida contable.
- Los lotes sin fecha de vencimiento no aparecen en este reporte.
- No se añadió migración SQL.

## Validación pendiente
- Ejecutar build frontend/backend y pruebas de integración con PostgreSQL.
- Verificar datos reales de lotes y variantes en la base antes de habilitar en producción.
