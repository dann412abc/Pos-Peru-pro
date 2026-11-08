# Etapa 14 — inventario de variantes por sucursal

## Implementado
- Tabla `producto_variante_stock`: saldo y stock mínimo por variante, empresa y sucursal.
- Backfill inicial a cero para todas las variantes existentes en cada sucursal. No se duplica el stock del producto padre.
- Triggers para crear saldos cero al registrar una variante o una sucursal nueva.
- Enlace opcional de lotes y movimientos a una variante, manteniendo intactos los registros históricos del producto general.
- Consulta de stock de variante por sucursal.
- Ajustes de entrada/salida con transacción, bloqueo de fila, control de saldo y lotes, auditoría e idempotencia opcional.
- Acceso a sucursales limitado por `sucursalIds` del usuario; escritura solo ADMIN.

## API
- `GET /api/inventario/variantes/:varianteId/stock?sucursalId=1`
- `POST /api/inventario/variantes/ajustes`

Ejemplo:
```json
{
  "varianteId": 4,
  "sucursalId": 1,
  "tipo": "ENTRADA",
  "cantidad": 12,
  "motivo": "Ingreso de paquete por compra",
  "idempotencyKey": "ajuste-var-2026-0001"
}
```

## Importante: ventas aún no descuentan stock de variantes
La venta actual trabaja con `producto_stock` y lotes de producto sin variante. Esta etapa habilita y audita saldos de variante, pero no altera silenciosamente las ventas existentes. La etapa siguiente debe modificar el contrato de las líneas de venta, FEFO, devoluciones, anulaciones y reportes en una sola transición coordinada. Hasta entonces, no ofrecer en caja venta de variantes con descuento automático.

## Migración
`backend/src/database/migrations/1710000000012-stock-por-variante.ts`
Preparada pero NO ejecutada. Añade stock inicial cero y no migra el stock actual del producto padre.
