# v1.44.38 — Reconciliación del preflight del esquema de ventas

## Hallazgo
El diagnóstico de v1.44.36 pedía columnas que no forman parte del esquema real (por ejemplo `producto.tiene_variantes`) y ubicaba algunos campos en tablas incorrectas. Eso podía producir falsos bloqueos o dar una lectura equivocada de la preparación de la RPC.

## Corrección
Se incorpora `supabase/migrations-preview/202611070022_sales_rpc_schema_preflight_corrected.sql`, reconstruido contra las migraciones TypeORM del repositorio. Entre otros ajustes:

- Se elimina `producto.tiene_variantes` del contrato; el modo de variantes se define en una migración posterior y no se presupone aquí.
- `costo_promedio` se valida en `producto_stock` y `producto_variante_stock` según las migraciones que lo agregan.
- No se exige `empresa_id` en `comprobante_pago` ni en `caja_movimiento`.
- Se conserva `request_hash` en `comprobante`, incorporado por la migración de notas de crédito/débito y normalizado a SHA-256 de 64 caracteres en el preview v1.44.37.
- Se incluyen campos de variante, lotes FEFO, movimiento de inventario y cuenta por cobrar únicamente donde las migraciones los declaran.

## Seguridad y alcance
- SQL de diagnóstico estrictamente de solo lectura: consulta `information_schema.columns` y `to_regclass`.
- No ejecuta migraciones, no modifica datos y no crea objetos.
- No prueba valores de CHECK, claves foráneas, índices, RLS, permisos, estado real de las migraciones ni lógica de negocio.
- Que el diagnóstico no devuelva faltantes **no significa** que la RPC esté implementada ni que se pueda habilitar el botón Cobrar.

## Pruebas
`node --test supabase/migrations-preview/202611070022_sales_rpc_schema_preflight_corrected.test.mjs`

La prueba comprueba que no se reintroduzcan algunos campos incorrectos, que los nombres requeridos tengan respaldo textual en el conjunto de migraciones y que el SQL sea de solo lectura.

## Próximo bloque
Con el contrato del esquema reconciliado, el siguiente bloque puede abordar identidad, autorización de sucursal, bloqueo de caja e idempotencia dentro del diseño de la RPC, todavía sin conectar el cobro.
