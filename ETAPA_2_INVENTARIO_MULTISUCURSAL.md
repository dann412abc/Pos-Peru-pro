# Etapa 2 — Inventario independiente por sucursal

## Qué cambia

La fuente de verdad del inventario deja de ser `producto.stock` (un único saldo por empresa) y pasa a ser `producto_stock`, con una fila por producto y sucursal. La columna histórica `producto.stock` se conserva por compatibilidad de esquema, pero queda en cero y no debe utilizarse para calcular disponibilidad.

Se modificaron los siguientes flujos:

- Listado y detalle de productos: devuelven el saldo de la sucursal consultada.
- Creación de productos: registra el stock inicial únicamente en la sucursal activa y crea su movimiento de entrada.
- Ajustes manuales: entrada/salida dentro de una transacción, con bloqueo del saldo, motivo y stock anterior/posterior.
- Ventas: valida, bloquea y descuenta existencias de la sucursal donde se registra la venta.
- Anulación: repone las cantidades en la sucursal original de la venta y registra los saldos anterior/posterior.
- Transferencias: descuenta en origen y abona en destino dentro de la misma transacción; ambos movimientos comparten un `transferenciaId`. La operación admite una clave idempotente para reintentos.
- Nuevas sucursales: un trigger crea saldo cero para los productos existentes.
- Nuevos productos: un trigger crea saldo cero para todas las sucursales de su empresa; la creación asigna el stock inicial a la sucursal activa.

## Política para migrar stock existente

La migración `1700000000003-stock-por-sucursal` conserva el inventario global anterior sin duplicarlo: asigna el saldo histórico de cada producto a la sucursal de menor ID de su empresa y crea saldo cero en las demás sucursales. Se eligió este criterio porque no hay en el esquema anterior información suficiente para reconstruir a qué sucursal pertenecía cada unidad.

La migración se detiene si encuentra productos de una empresa sin sucursal. En ese caso se debe crear/asignar una sucursal válida antes de volver a ejecutarla.

## Aplicación

1. Hacer backup de PostgreSQL.
2. Desplegar los archivos de esta versión.
3. Ejecutar en `backend`: `npm ci` y luego `npm run migration:run`.
4. Reiniciar backend y frontend.
5. Verificar productos por sucursal, ajuste de entrada/salida, venta y anulación en una sucursal de prueba.

No ejecutar manualmente el SQL de la migración ni revertirla en producción. El `down` no consolida saldos multisucursal a la columna antigua porque hacerlo perdería la distribución.

## Límites conocidos

- El encabezado permite elegir entre las sucursales asignadas al usuario. El cambio se deshabilita sin conexión para no reutilizar una caché de inventario de otra sucursal. Los endpoints aceptan `sucursalId` explícito y el backend comprueba los permisos.
- La pantalla de productos permite trasladar un producto por operación; el endpoint admite lotes de hasta 200 productos. Se incluye un historial visual de las últimas 100 transferencias entre sucursales asignadas al usuario.
- La compilación completa y las pruebas de integración requieren instalar dependencias y conectar una instancia PostgreSQL de prueba.
