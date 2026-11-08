# Contrato de creación transaccional de ventas Supabase — v1.44.35

## Estado de esta entrega

Documento de ingeniería previo a la RPC. No crea ventas, no modifica inventario y no habilita el cobro Supabase. Se mantiene la protección de Venta Rápida introducida en v1.44.31 y la preconsulta de idempotencia de v1.44.33/34.

## Identidad y ámbito

La función pública será `public.pos_venta_crear_auth(p_payload jsonb) RETURNS jsonb`, `SECURITY DEFINER`, con `search_path` fijo. Debe exigir `auth.uid()` y resolver el usuario POS mediante `usuario.supabase_auth_user_id`, `usuario.activo`, `empresa_id` y `usuario_sucursal`. `usuarioId`, `empresaId`, `rol` y `cajaId` del navegador nunca serán autoridad. La sucursal se acepta como selector, pero se vuelve a validar dentro de la función contra `usuario_sucursal` y la empresa resuelta.

## Contrato de entrada normalizado

```json
{
  "sucursalId": 1,
  "clienteId": 12,
  "tipo": "03",
  "descuentoGlobal": 0,
  "fechaVencimiento": "2026-12-07",
  "motivoDescuento": null,
  "idempotencyKey": "pos-uuid-or-random-key",
  "lineas": [
    {"productoId": 7, "varianteId": null, "cantidad": 2, "precioUnitario": 5.9, "descuento": 0}
  ],
  "pagos": [
    {"metodo": "EFECTIVO", "monto": 11.8, "montoRecibido": 20}
  ]
}
```

Los valores monetarios y el total enviados por el cliente son datos no confiables. La función vuelve a leer precio y `tipo_igv` del catálogo y calcula el total en servidor. La UI debe enviar únicamente la selección comercial y el detalle de pagos.

## Decisiones de esquema confirmadas

- `comprobante.tipo` solo admite `01`, `03`, `07`, `08`; boleta=`03`, factura=`01`.
- Nota de venta no está representada en ese CHECK. No convertirla silenciosamente a boleta ni reservar serie SUNAT: requiere una tabla/serie interna separada o una migración de esquema con definición contable y de impresión aprobada.
- `comprobante_pago.metodo_pago`: `EFECTIVO`, `TARJETA`, `YAPE`, `PLIN`, `CREDITO`.
- `caja_movimiento.metodo_pago`: `EFECTIVO`, `TARJETA`, `YAPE`, `PLIN`; crédito no es ingreso de caja.
- `caja` se identifica por sucursal y usuario y solo admite una caja `ABIERTA` por usuario/sucursal.
- Stock base: `producto_stock(producto_id,sucursal_id)`; stock de variante: `producto_variante_stock(variante_id,sucursal_id)`. Nunca descontar simultáneamente padre y variante.
- Lotes: `inventario_lote` y `comprobante_lote_salida`; las salidas deben seguir FEFO y respetar `variante_id` cuando aplique.
- Crédito: `cuenta_cobrar` y `cliente.saldo_credito`; debe insertarse solo por la porción `CREDITO` del pago mixto.
- La huella `request_hash` se calcula sobre el JSONB normalizado sin `idempotencyKey` y se persiste en el mismo INSERT de `comprobante`.

## Orden transaccional requerido

1. Validar forma/tamaño de JSON, clave idempotente, tipo documental y líneas/pagos no vacíos.
2. Resolver identidad y sucursal autorizada desde `auth.uid()`.
3. Calcular hash canónico; buscar clave existente. Si hash igual, devolver comprobante existente; si difiere, error.
4. Bloquear caja abierta con `FOR UPDATE`; comprobar que pertenece al usuario y sucursal.
5. Validar cliente (si no se envía, resolver/crear cliente genérico con regla explícita; nunca asumir ID fijo).
6. Agregar líneas repetidas por producto/variante y bloquear filas de catálogo/stock en orden determinista para reducir deadlocks.
7. Releer precio vigente, `tipo_igv`, unidad y estado. Rechazar precio del navegador que no coincida con la regla comercial vigente o no esté autorizado como precio manual.
8. Replicar exactamente `calcularLinea`/`calcularComprobante`: precio incluye IGV; tipo 10 gravado, 20 exonerado, 30 inafecto; redondeo a 2 decimales por línea y totales; IGV 18% según motor vigente. No aplicar descuento global de forma distinta a NestJS.
9. Validar pagos: suma pagada + crédito = total; efectivo recibido >= efectivo aplicado; vuelto solo sobre efectivo; pagos no monetarios sin vuelto; crédito permitido por rol, límite y saldo del cliente.
10. Reservar correlativo con `UPDATE serie_correlativo ... RETURNING` dentro de la transacción. No usar `MAX(correlativo)+1`.
11. Insertar comprobante, líneas y pagos con `request_hash` e `idempotency_key`.
12. Descontar stock bloqueado. Si hay lotes, recorrer por vencimiento ascendente (NULL al final) y `id`, registrar cada salida en `comprobante_lote_salida`; fallar si los lotes no cubren la cantidad. Sin lotes, aplicar la regla documentada para el saldo de la sucursal. Crear `movimiento_inventario` con stock anterior/posterior e idempotencia.
13. Crear `cuenta_cobrar` por el monto CREDITO y actualizar `cliente.saldo_credito` de forma consistente.
14. Registrar `caja_movimiento` solo por pagos reales (efectivo/tarjeta/Yape/Plin), no por crédito; registrar vuelto descontando del efectivo neto ingresado según la política contable definida.
15. Devolver ID, tipo/serie/correlativo, total, vuelto y estado. Cualquier excepción revierte todos los pasos.

## Bloqueos e idempotencia concurrente

La preconsulta HTTP de v1.44.34 no reserva claves. La garantía real será el índice único `uq_comprobante_empresa_idempotency` más el INSERT transaccional. La RPC debe capturar `unique_violation` únicamente para esa restricción, volver a leer la fila y comparar `request_hash`; hash igual devuelve la venta anterior, hash distinto rechaza. No capturar indiscriminadamente cualquier error 23505.

Los locks de stock se adquieren ordenando por `producto_id, variante_id NULLS FIRST`; los lotes por `fecha_vencimiento NULLS LAST, id`. Todas las funciones de inventario que compitan con ventas deben respetar el mismo orden de bloqueo.

## Casos de aceptación obligatorios

- Venta simple gravada, exonerada e inafecta con redondeos comparados contra pruebas de `igv.engine.spec.ts`.
- Producto base y variante; nunca mezclar sus saldos.
- Venta con lotes múltiples FEFO y lote vencido/no disponible.
- Stock insuficiente: no queda comprobante, pago, movimiento ni correlativo consumido.
- Caja cerrada/ausente o perteneciente a otro usuario: rechazo.
- Sucursal de otra empresa o no asignada: rechazo.
- Pago efectivo con vuelto; tarjeta/Yape/Plin; mixto; crédito parcial y total.
- Crédito que supera límite o no tiene cliente válido: rechazo.
- Dos llamadas concurrentes con misma clave y mismo payload: un solo comprobante y ambas obtienen el mismo ID.
- Misma clave y payload diferente: conflicto sin efectos secundarios.
- Error inyectado después de descontar stock: rollback de todos los cambios.
- Comprobante interno nota de venta: no habilitar hasta definir numeración interna separada.

## Condiciones para habilitar cobro

No retirar guardias frontend ni conectar botón Cobrar hasta: revisar migración preview; probar función en PostgreSQL de staging con esquema completo; ejecutar pruebas de concurrencia y rollback; verificar contabilidad de vuelto y crédito; comprobar compatibilidad de serie y nota de venta; e integrar Cloudflare con Bearer Supabase sin `service_role` expuesta.
