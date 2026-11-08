# Etapa 32 — Mermas, pérdidas y bajas auditadas

## Implementado
- Nueva migración `1710000000020-mermas-inventario.ts` para registrar cada baja de inventario.
- Registro por lote, producto y variante/presentación.
- Motivos: vencido, dañado, pérdida, contaminación u otro.
- Observación obligatoria, cantidad, usuario, fecha, costo unitario y costo total estimado.
- Descuento transaccional del lote y del saldo de inventario del producto o variante.
- Movimiento de inventario de salida y registro de merma vinculados.
- Idempotencia mediante UUID por usuario y empresa.
- Historial de hasta 1.000 registros y exportación CSV.
- Pantalla administrativa `Mermas y pérdidas`.

## Controles
- Solo ADMIN puede registrar y consultar mermas.
- El lote debe pertenecer a la empresa y a una sucursal autorizada.
- La cantidad no puede superar el saldo del lote ni el stock de la presentación/producto.
- Se registra costo de baja como cantidad × costo unitario del lote.
- La operación se realiza en una transacción: si falla el descuento del lote, stock o auditoría, todo se revierte.
- La operación no elimina el lote ni borra el historial.

## Migración pendiente
La nueva migración debe ejecutarse antes de utilizar esta pantalla. No fue ejecutada y no se modificó Supabase.

## Validaciones pendientes
- Pruebas de integración en PostgreSQL, concurrencia con ventas y verificación de totales en inventario.
- Build completo de frontend y backend.
- Validar el nombre de usuario y costo unitario con datos de la instalación.
