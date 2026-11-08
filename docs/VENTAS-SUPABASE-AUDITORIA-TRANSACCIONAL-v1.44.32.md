# Auditoría para el registro transaccional de ventas en Supabase — v1.44.32

## Resultado

Esta entrega prepara el siguiente bloque crítico. **No implementa ni habilita todavía el cobro Supabase.** La protección introducida en v1.44.31 permanece activa: no se envían ventas al API NestJS ni a la cola offline heredada cuando `VITE_AUTH_PROVIDER=supabase`.

## Identidad y autorización

El patrón vigente de identidad es `auth.uid()` → `public.usuario.supabase_auth_user_id` → usuario POS activo → `public.usuario_sucursal`. La RPC de ventas deberá resolver internamente `usuario_id`, `empresa_id` y rol desde esa relación; nunca aceptará esos identificadores como autoridad enviados por el navegador. También deberá comprobar que la sucursal pertenece a la empresa y está asignada al usuario.

## Operación que debe ser atómica

La transacción de venta debe cubrir, como mínimo:

1. Bloqueo y validación de caja abierta para usuario y sucursal.
2. Resolución/validación del cliente dentro de la empresa.
3. Bloqueo de productos, variantes y saldos de inventario de la sucursal.
4. Verificación de precio vigente en catálogo, cantidad, descuentos y permisos.
5. Cálculo de operaciones gravadas/exoneradas/inafectas e IGV según el motor vigente.
6. Validación de pagos mixtos, efectivo recibido/vuelto y límite de crédito.
7. Reserva atómica del correlativo de la serie.
8. Inserción de comprobante, líneas y pagos.
9. Descuento de lotes FEFO y existencias por producto/variante, con movimientos de inventario.
10. Registro de la cuenta por cobrar y actualización del saldo del cliente si existe crédito.
11. Registro de movimientos de caja compatibles con los métodos de pago y la conciliación de caja.
12. Idempotencia fuerte: misma clave + mismo contenido devuelve la venta anterior; misma clave + contenido distinto se rechaza.

La emisión electrónica debe quedar fuera de la transacción principal y ejecutarse mediante un mecanismo posterior/reintentable.

## Hallazgos del esquema que impiden copiar literalmente el servicio NestJS

- El vínculo de identidad Supabase se incorpora mediante `usuario.supabase_auth_user_id`; no debe confundirse con el `usuarioId` numérico del modelo NestJS.
- `comprobante` obtiene `idempotency_key` en la migración 1700000000002. La columna `request_hash` aparece en el flujo de notas de débito, pero no está garantizada para ventas por la migración base revisada. Para ventas se debe añadir/confirmar explícitamente antes de usarla.
- `comprobante_linea` incorpora `empresa_id`, `variante_id`, `variante_nombre` y `variante_codigo` en la migración 1710000000013; `costo_unitario` se agrega en 1700000000004.
- `movimiento_inventario` incorpora `variante_id` y `idempotency_key` en 1710000000012; los campos de stock anterior/posterior proceden de 1700000000003.
- `inventario_lote` y `comprobante_lote_salida` se crean en 1700000000007; las relaciones con variantes se completan en 1710000000013.
- `caja_movimiento` tiene tipos `INGRESO`/`SALIDA` y medios `EFECTIVO`/`TARJETA`/`YAPE`/`PLIN`; el servicio NestJS revisado no registra aquí los pagos de la venta. La RPC nueva debe definir explícitamente el tratamiento contable y evitar contabilizar crédito como entrada de caja.
- La tabla `comprobante` acepta tipos `01` y `03` para venta. La nota de venta (documento interno) no está representada en ese CHECK de la migración inicial y necesita un diseño de numeración/registro distinto o una migración compatible, antes de ofrecerla como comprobante emitido por esta RPC.
- La venta de NestJS calcula IGV mediante `calcularComprobante`; no se debe sustituir por un cálculo aproximado ni asumir una tasa fija sin replicar los tipos de IGV y redondeos del motor.

## Contrato de entrada observado en Venta Rápida

La UI construye `sucursalId`, opcionalmente `clienteId` o `cliente`, `tipo`, `pagos[]`, opcionalmente `fechaVencimiento` y `motivoDescuento`, `lineas[]` con `productoId`, `varianteId`, `cantidad`, `precioUnitario`, `descuento`, e `idempotencyKey`. La RPC debe validar cada campo en servidor; el total mostrado por el navegador no es autoridad.

## Criterios para retirar la protección de v1.44.31

No retirar la guardia hasta contar con: migración preview revisada; RPC con autorización derivada de `auth.uid()`; endpoint Cloudflare con Bearer; integración UI que conserve carrito ante error y solo lo limpie tras confirmación; pruebas de concurrencia/idempotencia, stock insuficiente, caja cerrada, pagos mixtos, crédito, variantes, lotes vencidos, descuentos y rollback; y validación en un proyecto Supabase de staging con datos de prueba.

## Alcance de esta versión

Solo auditoría de esquema, contrato y criterios de aceptación. No se ejecuta SQL, no se modifica Supabase remoto, no se despliega Cloudflare y no se habilita el cobro.
