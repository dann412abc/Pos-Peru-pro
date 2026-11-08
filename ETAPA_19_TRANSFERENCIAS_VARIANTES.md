# Etapa 19 — Transferencias entre sucursales por variante

## Implementado
- Transferencia administrativa de una presentación/variante entre dos sucursales autorizadas.
- Validación de pertenencia de la variante al producto y empresa, producto/variante activos y existencia de saldos en ambas sucursales.
- Bloqueo transaccional de los saldos para evitar transferencias concurrentes que excedan el stock.
- Descuento y abono del stock por variante, sin modificar el stock agregado del producto padre.
- Traslado de lotes de origen en orden FEFO, preservando fecha de vencimiento y costo unitario.
- Recalculo ponderado del costo promedio de la variante en destino usando el costo real de los lotes transferidos.
- Movimientos SALIDA/ENTRADA con variante y transferencia vinculadas.
- Idempotencia mediante la clave única de transferencia existente.
- Acción y formulario de transferencia desde la gestión de presentaciones.
- Historial de transferencias ahora muestra el nombre de la variante cuando corresponde.

## Migraciones y servicios
- No se añade migración: se reutilizan `transferencia_inventario`, `producto_variante_stock`, `inventario_lote.variante_id` y `movimiento_inventario.variante_id`, introducidos en etapas anteriores.
- No se ejecutó ninguna migración ni se modificó Supabase remoto.
- No se desplegó Cloudflare.

## Validaciones pendientes
- Ejecutar instalación de dependencias y compilación integral frontend/backend en un entorno con acceso a paquetes.
- Ejecutar pruebas de integración en una base de datos de prueba con dos sucursales, lotes con vencimientos distintos y transferencias concurrentes.
- Confirmar en entorno de pruebas que el costo promedio de destino coincide con el cálculo ponderado esperado.
