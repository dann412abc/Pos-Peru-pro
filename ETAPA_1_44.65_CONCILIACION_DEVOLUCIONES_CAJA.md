# Etapa 1.44.65 — Conciliación de devoluciones

La caja ahora contempla reembolsos de devoluciones registradas. El desglose neto resta el importe reembolsado en el medio real, y el efectivo esperado resta solo los reembolsos hechos en efectivo. El historial presenta los reembolsos como salidas identificables.

## Regla contable
- Efectivo: saldo inicial + cobros en efectivo − reembolsos en efectivo + movimientos manuales netos.
- Tarjeta/Yape/Plin: cobros menos reembolsos del mismo medio.
- Crédito revertido no representa salida de caja y no se resta del efectivo esperado.

## Dependencias
Se usan las tablas ya definidas por la migración de devoluciones: `devolucion_venta` y `devolucion_venta_pago`.

## Precaución
No aplicar en producción todavía. Validar primero contra staging, especialmente columnas y relación de caja/usuario.
