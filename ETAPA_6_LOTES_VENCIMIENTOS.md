# Mi Carrito POS v1.6.0 — Lotes, vencimientos y devoluciones a proveedores

## Qué incluye

- Lotes y vencimiento en cada recepción de compra; lote de apertura sin fecha para el stock existente.
- Picking FEFO en ventas; lotes vencidos no se venden.
- Asignaciones guardadas para restituir los mismos lotes al anular una venta.
- Ajustes, transferencias y devoluciones de clientes sincronizan los saldos de lote.
- Alertas visibles en Compras y endpoint `GET /api/inventario/vencimientos?dias=30`.
- Devolución de una compra desde su detalle. La cantidad se valida contra lote/compra; la nota reduce cuentas por pagar y el excedente queda como saldo a favor. Transacción PostgreSQL y clave idempotente.
- Venta Rápida acepta lector teclado USB/Bluetooth y cámara Android mediante BarcodeDetector del navegador, cuando esté disponible.

## Instalación desde v1.5.0

1. Hacer respaldo de PostgreSQL y conservar los `.env` actuales.
2. Desplegar backend/frontend v1.6.0 e instalar dependencias con sus lockfiles.
3. Ejecutar `npm run migration:run` en el backend conectado a la base existente. La nueva migración es `1700000000007-lotes-devoluciones-proveedor.ts` y corre después de 0000–0006.
4. No ejecutar nuevamente el SQL inicial, no borrar tablas ni reiniciar volúmenes.
5. Capturar lote y fecha real al recibir cada compra. Las existencias anteriores no tienen fecha inferible y se conservan en el lote `APERTURA-*` sin vencimiento.

La migración `down` se niega a ejecutarse cuando existen lotes de compras, devoluciones a proveedor o ventas con asignación a lotes. Esto protege el historial operativo. Requiere PostgreSQL y privilegios para crear tablas, índices y claves foráneas.

Las compras históricas anteriores a v1.6.0 no contienen lote por línea. Se conservan como saldo de apertura sin fecha; una devolución de esas líneas usa las existencias vendibles actuales de la sucursal y sigue limitada por la cantidad de la línea original. No se atribuye una fecha ni un lote histórico que el sistema no registró.

## Operación de escáner

En Venta Rápida, enfocar el campo de escaneo para lectores tipo teclado que envían Enter al terminar. En Android, otorgar permiso de cámara y servir la aplicación por HTTPS (localhost también es válido). Si el navegador no implementa BarcodeDetector, el lector de teclado sigue disponible.

## Verificación realizada

Se incluyeron pruebas unitarias del cálculo de aplicación de nota del proveedor. No se ejecutaron compilaciones completas, migración en PostgreSQL ni pruebas E2E de dispositivos en esta entrega. La emisión SUNAT/OSE continúa simulada.
