# Etapa 1.44.36 — Auditoría de prerrequisitos para RPC de ventas

## Objetivo
Verificar el esquema real antes de crear la RPC transaccional. La operación afecta caja, correlativos, pagos, inventario por sucursal/variante, lotes FEFO y crédito.

## Archivo agregado
`supabase/migrations-preview/202611070020_sales_rpc_schema_preflight.sql`

- Diagnóstico SQL de solo lectura: no crea ni altera objetos.
- No registra ventas ni cambia stock, caja, saldos o correlativos.
- Lista tablas/columnas ausentes y entrega un resumen.
- Si falta cualquier prerrequisito, detener el desarrollo de la RPC hasta reconciliar las migraciones.

## Reglas vigentes
- Identidad, empresa, rol y usuario se resuelven desde `auth.uid()`.
- La sucursal se valida mediante `usuario_sucursal`.
- Precio y `tipo_igv` se releen del catálogo; precio incluye IGV.
- IGV gravado 18%; exonerado e inafecto no generan IGV.
- Stock base y de variante nunca se descuentan simultáneamente.
- Lotes FEFO, excluyendo lotes vencidos.
- Idempotencia dentro de la transacción, con índice único y hash.
- Crédito crea cuenta por cobrar y no ingreso de caja.
- Nota de venta requiere numeración interna separada.

## Estado
`public.pos_venta_crear_auth(jsonb)` todavía NO existe. No conectar el botón Cobrar ni desplegar la función. No ejecutar migraciones de escritura.

## Siguiente paso
Ejecutar este diagnóstico en staging. Con el resultado real se construye y prueba la RPC por bloques: identidad/caja/idempotencia; cálculo y detalle; stock/lotes; pagos/crédito; caja; concurrencia y rollback.
