# Etapa 18 — Compras y recepción por presentación

## Objetivo
Integrar las familias de variantes de la etapa 17 con el módulo de compras para que la recepción de mercadería, lotes, movimientos y costos promedio se apliquen a la presentación concreta.

## Flujo operativo
1. Abrir Compras y seleccionar proveedor y documento.
2. Seleccionar el producto.
3. Si el producto es una familia con variantes, elegir la presentación recibida (por ejemplo, Coca-Cola 600 ml o 3 L).
4. Indicar cantidad de empaques (por ejemplo, 10 cajas), tipo de empaque, unidades que contiene cada empaque (por ejemplo, 12) y costo total del empaque.
5. Registrar lote y vencimiento.
6. Guardar y recibir. El sistema convierte 10 cajas × 12 unidades en 120 unidades de inventario, calcula el costo unitario (costo de caja / 12) e incrementa el saldo y costo promedio de esa presentación, no el del producto padre.

## Backend
- `LineaCompraDto` acepta `varianteId` opcional.
- Valida que productos únicos no reciban variantes y que las familias con variantes reciban una presentación válida.
- Bloquea producto, presentación y saldo de sucursal durante la operación.
- Convierte empaques a unidades reales de inventario y distribuye el costo del empaque por unidad.
- Guarda cantidad/tipo de empaque, unidades por empaque y costo de empaque para trazabilidad.
- Calcula costo promedio por presentación con el mismo cálculo ponderado usado para productos únicos.
- Registra `compra_linea.variante_id` y snapshots de nombre/código de presentación.
- Registra el lote con `inventario_lote.variante_id`.
- Actualiza `producto_variante_stock.stock` y `costo_promedio`.
- Registra movimientos de inventario con `variante_id`.
- El detalle de compra muestra presentación y conserva trazabilidad.
- Anulación y devolución al proveedor descuentan el inventario, costo promedio, lote y movimiento de la misma variante.

## Frontend
- En el formulario de compra, al seleccionar una familia se cargan sus presentaciones.
- La presentación es obligatoria cuando el producto tiene variantes.
- El costo promedio de la presentación se propone como costo de compra inicial editable.
- Productos únicos siguen el flujo anterior sin cambios.

## Base de datos
La migración `1710000000015-compras-variantes.ts`:
- Añade `variante_id`, `variante_nombre` y `variante_codigo` a `compra_linea`.
- Añade `unidad_compra`, `cantidad_empaques`, `unidades_por_empaque` y `costo_empaque`; los registros históricos se convierten a empaque unitario sin alterar cantidades ni costos existentes.
- Añade `variante_id` a `devolucion_proveedor_linea`.
- Añade claves foráneas compuestas e índices.
- Sustituye la unicidad por producto de compra por índices parciales: una línea base por producto o una línea por variante.

La migración está incluida, pero **no se ejecutó**. No se modificó Supabase remoto.

## Alcance pendiente
- Transferencias entre sucursales para variantes.
- Reportes de compras, ventas y margen por presentación.
- Pruebas de integración contra una base de datos de pruebas con las migraciones aplicadas.
