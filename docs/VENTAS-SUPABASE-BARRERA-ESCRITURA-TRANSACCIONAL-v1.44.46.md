# v1.44.46 — barrera fail-closed de escritura transaccional

## Objetivo

Introducir un punto único de entrada autenticado para la futura venta transaccional sin habilitar escrituras parciales antes de completar todos los subsistemas.

## RPC incorporada

`public.pos_venta_transaccion_guardia_auth(p_payload jsonb)`:

- `SECURITY DEFINER` y `search_path` fijo.
- Solo `authenticated` tiene permiso de ejecución; `PUBLIC` y `anon` quedan revocados.
- Ejecuta `pos_venta_preparar_auth` dentro de la misma llamada SQL, reuniendo identidad, sucursal/caja, idempotencia, catálogo/stock, cálculo IGV y validación de pagos.
- Devuelve siempre `ok=false`, `decision=WRITER_DISABLED` y `SALE_TRANSACTIONAL_WRITER_NOT_READY`.
- No inserta ni actualiza comprobantes, líneas, pagos, inventario, lotes, caja o cuentas por cobrar; tampoco consume correlativos.

## Por qué todavía no escribe

La auditoría v1.44.45 detectó columnas e índices que deben confirmarse contra el esquema real. Además, la transacción completa todavía debe integrar descuentos de stock, salidas FEFO, movimientos, crédito, contabilidad de vuelto, correlativo e idempotencia concurrente. Permitir solo cabecera/líneas/pagos dejaría ventas inconsistentes; por eso la barrera rechaza deliberadamente cualquier intento.

## Validación

Prueba estática de la definición SQL: permisos, `search_path`, delegación a prevalidación, respuesta de bloqueo y ausencia de DML. No equivale a ejecutar PostgreSQL ni a validar migraciones en Supabase.

**No ejecutar todavía. No habilitar Cobrar.** El siguiente bloque debe completar y probar el escritor integral en PostgreSQL de staging, incluyendo rollback y concurrencia, antes de sustituir esta barrera.
