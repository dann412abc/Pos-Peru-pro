# Etapa 27 — Órdenes de compra a proveedores

## Implementado
- Nueva migración `1710000000018-ordenes-compra.ts` para cabecera y detalle de órdenes.
- Estados: BORRADOR, ENVIADA, RECIBIDA_PARCIAL, RECIBIDA y CANCELADA. En esta etapa el flujo operativo habilita BORRADOR, ENVIADA y CANCELADA; los estados de recepción quedan preparados para la siguiente etapa.
- Numeración automática `OC-AAAA-0000000`.
- Registro de proveedor, sucursal, fecha estimada de entrega, observaciones y líneas con producto/variante, cantidad y costo estimado.
- Consulta de órdenes con cantidad de líneas y unidades pendientes.
- Envío de orden y cancelación con bloqueo transaccional y validación de estado.
- Aislamiento por empresa y sucursales autorizadas.
- Nueva pestaña «Órdenes de compra» y creación de una orden desde las sugerencias de reposición.

## Límites explícitos
- Esta etapa no descuenta ni incrementa inventario.
- No registra recepción parcial o total todavía; la orden no sustituye el comprobante de compra recibido del proveedor.
- No emite ni envía correos/WhatsApp al proveedor.
- La recepción con comparación pedido vs recibido, actualización de stock/lotes/costo promedio y vínculo a la compra se implementará en la etapa 28.
- El total es estimado y debe confirmarse con el documento real del proveedor.

## Base de datos y despliegue
- Se agrega una migración nueva, pero NO se ejecuta.
- No se modificó Supabase remoto.
- No se desplegó Cloudflare.
- Antes de usar la nueva pestaña, debe aplicarse manualmente la migración 0018 en el entorno de pruebas, después de revisar su SQL y respaldar la base.

## Validaciones pendientes
- Pruebas de integración con PostgreSQL para creación, permisos, concurrencia, envío y cancelación.
- Build completo frontend/backend con dependencias instaladas.
- Validación de nombres/relaciones de FK en una copia de la base real.
