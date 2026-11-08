# Etapa 15 — variantes conectadas al POS, ventas, devoluciones y anulaciones

## Flujo de caja
- El POS consulta las variantes del producto antes de agregarlo.
- Si existen variantes, presenta un selector con código, stock por sucursal y precio.
- El escáner resuelve primero el código del producto; si no existe, consulta el código interno o de barras de una variante.
- La línea del carrito y el payload de venta guardan `varianteId`.
- El backend valida que la variante pertenezca al producto y a la empresa, esté activa y tenga saldo en la sucursal.
- El precio y tipo de IGV se resuelven en servidor. El precio enviado por el cliente se compara con el catálogo y no se acepta un precio manipulado.
- El backend agrupa stock por producto base o por variante, bloquea filas, descuenta saldos y consume lotes FEFO en la misma transacción que la venta.
- Los comprobantes conservan nombre y código de variante como snapshot histórico.

## Devoluciones y anulaciones
- La anulación restituye el saldo de la variante correcta y los lotes originales de la venta.
- La devolución parcial o total restituye stock a la variante original.
- Se registra la asignación de lotes restituida en `devolucion_venta_lote`, para no perder la fecha de vencimiento ni permitir devolver más cantidad de la salida original.
- Las ventas antiguas mantienen `variante_id = NULL` y continúan usando el stock del producto base.

## API POS
- `GET /api/productos/:productoId/variantes?sucursalId=1`
- `GET /api/productos/variantes/buscar?codigo=7750123456789&sucursalId=1`
- `POST /api/ventas` acepta `varianteId` opcional por línea.
- La consulta de devolución devuelve `varianteId` por línea cuando corresponda.

Ejemplo de línea:
```json
{
  "productoId": 25,
  "varianteId": 4,
  "cantidad": 2,
  "precioUnitario": 5.50,
  "descuento": 0
}
```

## Migración preparada
`backend/src/database/migrations/1710000000013-venta-variante-completa.ts`

Añade:
- `empresa_id` y snapshots de variante a `comprobante_linea`, con trigger de asignación de empresa.
- vínculo de variante en `comprobante_lote_salida` y `devolucion_venta_linea`.
- costo promedio por variante/sucursal.
- `devolucion_venta_lote` para trazabilidad de lotes restituidos.

La migración NO fue ejecutada. No se modificó el proyecto remoto de Supabase.

## Límites y validación pendiente
- La recepción de compras y transferencias todavía necesita integrarse para alimentar `producto_variante_stock` y `costo_promedio`; por ahora se puede ingresar stock por el endpoint de ajuste de variante.
- No se ha ejecutado compilación integral de TypeScript/Jest porque el ZIP se distribuye sin `node_modules`. Instalar dependencias en entorno de desarrollo y ejecutar las pruebas antes de desplegar.
- No habilitar la migración en producción sin revisar primero el esquema real y hacer respaldo.
