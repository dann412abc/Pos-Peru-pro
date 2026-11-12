# Revisión técnica — recepción de compras y trazabilidad de lotes
Fecha: 2026-11-09
Rama: work/returns-register-1.44.79
Alcance: revisión estática de las migraciones preview 002 y 005. No se ejecutó SQL ni se modificó Supabase.

## Resultado
La RPC `pos_compra_recibir_auth(jsonb)` tiene una estructura transaccional razonable para compra, líneas, lotes, stock, costo promedio, pagos y movimientos de caja. La revisión de texto no demuestra que compile ni que funcione en PostgreSQL; faltan pruebas de integración y concurrencia.

## Hallazgos que bloquean la validación funcional

### 1. La salida FEFO no queda vinculada a una línea concreta del comprobante
La tabla `comprobante_lote_salida` creada por la migración 002 contiene `comprobante_id`, `producto_id` y `variante_id`, pero no `comprobante_linea_id`. Si un comprobante contiene más de una línea del mismo producto/variante, no hay una relación inequívoca entre la cantidad descontada de cada lote y la línea vendida. La migración 003 ya limita algunos casos ambiguos de devolución, pero eso no reemplaza la relación directa de la salida de lote.

**Acción:** antes de habilitar FEFO, agregar una referencia a `comprobante_linea.id` con FK y adaptar la RPC de venta para insertar una salida por línea/lote. Backfill histórico solo cuando la correspondencia sea demostrable; no inventar asociaciones.

### 2. Las FK de lotes no aseguran integridad de empresa/sucursal/producto
`inventario_lote` guarda `empresa_id`, `sucursal_id`, `producto_id`, `variante_id`, `compra_id` y `compra_linea_id`, pero varias FK son individuales. Por ejemplo, que `sucursal_id` y `producto_id` existan no demuestra declarativamente que ambos pertenezcan a `empresa_id`; lo mismo aplica a variante, compra y línea de compra. La RPC de recepción comprueba el alcance antes de insertar, y el acceso directo está revocado, pero la integridad queda dependiente de cada función privilegiada.

**Acción:** revisar las claves únicas compuestas disponibles en las tablas padre y añadir FK compuestas cuando sea posible. Donde el esquema no permita una FK compuesta sin cambios de mayor alcance, mantener validación explícita dentro de cada RPC y documentar el límite. No aplicar restricciones sin verificar primero datos existentes y claves candidatas reales.

### 3. El bloqueo de caja necesita prueba coordinada con ventas y movimientos
La RPC de compra bloquea la fila de `caja` antes de calcular el efectivo disponible y registrar egresos. Esto protege compras concurrentes que respeten el mismo bloqueo, pero todavía debe comprobarse que las RPC de ventas y movimientos de caja usan el mismo orden/bloqueo. Si alguna modifica movimientos sin bloquear la caja, dos operaciones concurrentes podrían gastar el mismo efectivo disponible.

**Acción:** inspeccionar las RPC de venta y movimiento de caja y ejecutar una prueba concurrente en una base aislada: dos egresos simultáneos que, sumados, superen el efectivo disponible. Debe aprobar como máximo el importe que la caja puede cubrir.

### 4. Idempotencia de compra no sustituye la idempotencia de operaciones separadas
La RPC de recepción bloquea por empresa y clave idempotente y compara el hash del JSONB completo. El reintento idéntico de la compra completa debería devolver la compra existente sin repetir stock ni caja. Esto no prueba la idempotencia de futuros abonos a crédito ni de operaciones de pago independientes.

**Acción:** conservar la clave de compra y el mismo payload al reintentar. Diseñar y probar una RPC separada de abonos con su propia clave idempotente antes de habilitar pagos posteriores.

## Revisiones estáticas realizadas
- La RPC valida sesión, ADMIN, empresa y sucursal.
- La recepción convierte empaques a unidades base y costo unitario.
- La regla de IGV replica el cálculo legacy con costo ingresado incluido: tipo 10 divide el importe entre 1.18; tipos 20/30 no agregan IGV.
- La recepción crea lote, línea, movimiento y actualiza el stock dentro de la misma transacción.
- Los pagos físicos requieren caja; transferencia no crea movimiento de caja física.
- El primer pase bloquea productos/saldos ordenados por producto y variante.
- La RPC sigue siendo preview-only y depende de las migraciones 002 y 004.

## Estado de pruebas
- Revisión de código estática: realizada.
- Tests Node: no ejecutados en esta sesión.
- Compilación PostgreSQL/PLpgSQL: no ejecutada.
- Pruebas transaccionales/concurrencia: pendientes.
- Staging Supabase: no creado ni utilizado.
- Producción: sin cambios.
- PR #2: permanece en borrador; no fusionado ni desplegado.

## Próximo bloque
1. Verificar los contratos de bloqueo de `pos_registrar_venta` y `pos_registrar_movimiento_caja`.
2. Diseñar la relación `comprobante_lote_salida.comprobante_linea_id` y las restricciones compuestas compatibles con las claves reales.
3. Corregir migraciones/tests en la rama de trabajo.
4. Ejecutar pruebas reales en staging solo después de autorización expresa.


## Bloque siguiente identificado — movimientos de inventario, mermas y transferencias

La inspección de solo lectura de las RPC y de las pantallas frontend detectó otro bloqueo de integración que debe cerrarse antes de declarar completo el circuito de inventario:

- `pos_ajustar_inventario` cambia `producto_stock` y registra `movimiento_inventario`, pero no crea ni consume filas de `inventario_lote` y no tiene clave idempotente.
- `pos_transferir_inventario` cambia stock de origen/destino y registra movimientos, pero no mueve cantidades entre lotes ni conserva vencimiento/costo por lote. Su contrato actual solo recibe `productoId`, no variantes.
- La pantalla `Productos.tsx` sigue llamando a `/inventario/movimientos`, `/inventario/transferencias` y `/inventario/transferencias/variantes`.
- `Mermas.tsx` llama a `/inventario/mermas`; `ConteoFisico.tsx` utiliza rutas de conteo. Estas rutas no aparecen como operaciones migradas en el Edge actual, cuyo fallback responde 501 para rutas no migradas.
- No se encontró una RPC pública específica para transferir variantes en el proyecto Supabase consultado.

### Decisión de integración

No se debe habilitar en el modo Supabase un ajuste o transferencia que modifique el stock agregado sin mover los lotes correspondientes. El siguiente bloque debe preparar RPC autenticadas e idempotentes para ajuste, merma, conteo y transferencia; para transferencia se deben crear lotes de destino conservando código, vencimiento y costo, y mantener la relación entre movimientos de origen/destino y lotes. Las variantes requieren un contrato separado o una extensión explícita del modelo.

No se aplicaron cambios en producción. Este hallazgo no invalida la rama de venta FEFO, pero sí impide declarar completo el módulo de inventario hasta integrar estas operaciones.
