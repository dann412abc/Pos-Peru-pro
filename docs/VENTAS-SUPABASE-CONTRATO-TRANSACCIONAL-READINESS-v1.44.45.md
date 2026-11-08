# Ventas Supabase — preparación de RPC transaccional v1.44.45

## Resultado de esta etapa
Se prepara la auditoría final de prerrequisitos y se fija el contrato de escrituras para la futura `pos_venta_crear_auth(jsonb)`. **No se implementa ni habilita todavía una RPC que registre ventas.** La auditoría SQL incluida es de solo lectura sobre catálogos PostgreSQL.

## Hallazgo crítico de caja
El flujo vigente no registra cada pago de venta en `caja_movimiento`. El cálculo de efectivo disponible en `caja.service.ts` suma `comprobante_pago` asociado a comprobantes de la caja y luego aplica los movimientos manuales de `caja_movimiento`. Por tanto, la futura RPC de venta **no debe insertar un `caja_movimiento` adicional por el mismo cobro**, porque duplicaría ingresos en el arqueo. Los ingresos de venta se representan mediante `comprobante_pago`; `caja_movimiento` queda para ingresos/salidas manuales y operaciones específicas que ya lo utilizan.

## Contrato de escrituras atómicas
La futura RPC debe ejecutar todas estas operaciones en una sola transacción PostgreSQL; un error en cualquiera debe revertirlas todas:

1. Resolver `auth.uid()` a `usuario`, `empresa` y sucursales autorizadas. Ignorar IDs/roles/empresa enviados por el cliente.
2. Validar `idempotency_key` y `request_hash` dentro de la empresa. Si existe la misma clave y mismo hash, devolver el comprobante existente; si el hash difiere, rechazar el reintento.
3. Bloquear la caja ABIERTA del usuario/sucursal y bloquear el cliente cuando corresponda. Revalidar crédito con `cliente.limite_credito` y `cliente.saldo_credito` bloqueados.
4. Bloquear productos, variantes y saldos de stock en orden determinista. Nunca descontar stock base y stock de variante para el mismo artículo.
5. Recalcular IGV y total en servidor a partir de precios/tipos IGV del catálogo; validar pagos contra ese total.
6. Incrementar `serie_correlativo.ultimo_correlativo` con `UPDATE ... RETURNING` dentro de la transacción. No usar `MAX(correlativo)+1`.
7. Insertar `comprobante`, `comprobante_linea` y `comprobante_pago` con importes calculados en servidor.
8. Descontar lotes FEFO vigentes y registrar `comprobante_lote_salida`; actualizar stock de producto o variante y registrar `movimiento_inventario`.
9. Si existe componente a crédito, insertar `cuenta_cobrar` y actualizar `cliente.saldo_credito` en la misma transacción.
10. No duplicar ingresos de venta en `caja_movimiento`: los pagos de venta ya son fuente de ingresos de caja a través de `comprobante_pago`.
11. Devolver comprobante y pagos. La emisión/envío SUNAT debe quedar fuera de la transacción de venta, con cola/reintento posterior.

## Orden de bloqueos y concurrencia
- Usar un orden determinista para productos/variantes/stock y lotes para reducir deadlocks.
- La validación de preflight (`pos_venta_preparar_auth`) es informativa: sus locks terminan al finalizar esa llamada. La RPC final debe repetir todas las validaciones y bloqueos **dentro de su propia transacción**.
- La protección definitiva de idempotencia depende del índice único `uq_comprobante_empresa_idempotency` y del tratamiento específico de conflicto, verificando el hash antes de devolver el registro existente.
- El correlativo solo se consume dentro de la misma transacción que inserta el comprobante; cualquier fallo posterior debe revertirlo.

## Auditoría incluida
`supabase/migrations-preview/202611070030_sales_transactional_readiness_audit.sql` comprueba columnas, índices y restricciones críticas usando `information_schema`, `pg_indexes` y `pg_constraint`. Solo ejecuta SELECT; no es una migración de esquema.

## Bloqueadores detectados antes de escribir la RPC
- El nombre real de algunas restricciones puede variar por cómo TypeORM creó el esquema; la auditoría informa ausencias y nombres distintos para revisión, no aplica cambios automáticos.
- Debe verificarse en PostgreSQL de pruebas la compatibilidad exacta de las columnas, constraints, índices, privilegios y firmas de funciones auxiliares.
- El motor SQL de cálculo y el validador SQL de pagos todavía cuentan con pruebas estáticas; requieren pruebas de ejecución en PostgreSQL.
- La RPC final debe tratar expresamente la concurrencia de idempotencia, caja, crédito, stock, lotes y correlativo.
- No habilitar el botón Cobrar en el cliente Supabase hasta superar pruebas de integración y rollback.

## Seguridad operativa
No ejecutar todavía los archivos de `migrations-preview`. No se ha conectado ni modificado el proyecto Supabase del usuario y no se ha desplegado Cloudflare en esta etapa.
