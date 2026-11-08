# Mapa de módulos para migración RPC

Este mapa es una guía de diseño, no una lista de funciones SQL ya creadas.

| Dominio | Tablas/entidades actuales conocidas | Operaciones que deben ser RPC transaccionales |
|---|---|---|
| Identidad | usuario, empresa, sucursal, usuario_sucursal | resolver identidad POS y ámbito autorizado |
| Catálogo | producto, producto_variante, categoria, cliente | crear/editar/desactivar y lectura filtrada por tenant |
| Ventas | comprobante, comprobante_linea, comprobante_pago, serie_correlativo | crear venta idempotente, reservar correlativo, validar precio/IGV, registrar pagos y stock |
| Caja | caja, caja_movimiento | abrir, registrar movimiento, cobrar, cerrar y cuadrar |
| Inventario | movimiento_inventario, producto, producto_variante | ajuste, transferencia, conteo, merma y reserva con bloqueo concurrente |
| Compras | ordenes y recepciones (verificar esquema/migraciones) | recibir compra, aumentar stock y generar cuenta por pagar |
| Devoluciones | devoluciones/notas de crédito (verificar nombres reales) | validar cantidades devueltas, reponer stock y registrar reembolso por medio de pago |
| Finanzas | gastos, cuentas por cobrar/pagar | registrar abono/gasto y actualizar saldo en una transacción |
| Facturación | comprobante_electronico, fe_evento | outbox, envío, consulta, baja y almacenamiento de XML/CDR |
| Alertas | alerta_operativa, envios_notificacion | sincronización y entrega asíncrona con deduplicación |

Cada RPC debe validar `auth.uid()`, resolver empresa/sucursales desde relaciones persistidas, rechazar IDs de tenant suministrados por el cliente que no coincidan y registrar auditoría. No confiar en rol, empresa o sucursal enviados por el navegador.
