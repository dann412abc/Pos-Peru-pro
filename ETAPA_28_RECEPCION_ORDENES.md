# Etapa 28 — Recepción parcial y total de órdenes de compra

## Implementado
- Endpoint `POST /api/compras/ordenes/:id/recepciones`, exclusivo de ADMIN.
- Permite recibir cantidades parciales por línea, omitir líneas pendientes y completar la orden en varias recepciones.
- Valida que cada línea pertenezca a la orden y que la cantidad recibida no supere el saldo pendiente.
- Captura costo unitario real, documento del proveedor, lote y vencimiento por línea.
- Genera una compra real mediante el flujo existente `crearCompra`; este flujo actualiza inventario, costo promedio, lotes, movimientos y cuenta por pagar.
- Vincula cada recepción con la orden y con la compra generada; conserva historial de recepciones en el detalle.
- Estados automáticos: RECIBIDA_PARCIAL o RECIBIDA cuando todas las cantidades se completan.
- Idempotencia por clave de recepción para evitar duplicar una recepción confirmada.
- Conserva aislamiento por empresa/sucursal y valida acceso antes de operar.
- UI añade acción «Recibir» para órdenes enviadas o parcialmente recibidas.

## Migración
Se amplía `1710000000018-ordenes-compra.ts` (aún no aplicada) con:
- `tipo_igv` en cada línea de orden.
- `orden_compra_recepcion` como registro de auditoría y vínculo con `compra`.

## Consideraciones importantes
- La recepción se registra como compra a crédito, con fecha de vencimiento capturada o igual a la fecha del documento si no se especifica. Esto crea el saldo por pagar correspondiente; luego debe registrarse el pago desde Cuentas por pagar.
- Los costos ingresados son costo unitario con IGV incluido, conforme al contrato del módulo de compras.
- La UI actual usa cuadros de diálogo para cantidades/documento/lote/vencimiento; una pantalla de recepción dedicada con escáner y edición por fila queda como mejora UX.
- La creación de la compra y el vínculo final a la orden se ejecutan en transacciones consecutivas (el stock solo cambia cuando la compra se confirma). Se requiere prueba de concurrencia en PostgreSQL antes de producción; no operar recepciones simultáneas sobre la misma orden hasta completar esa validación.

## Seguridad y despliegue
- Migración no ejecutada.
- Supabase remoto no modificado.
- Cloudflare no desplegado.
- La migración 0018 debe revisarse y aplicarse en entorno de pruebas antes de usar la recepción.

## Validaciones pendientes
- Integración PostgreSQL para recepción parcial, total, idempotencia, sobrantes y errores.
- Concurrencia sobre una misma orden.
- Build integral frontend/backend y pruebas de navegador.
