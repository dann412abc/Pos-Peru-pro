# Mi Carrito POS v1.3.0 — Etapa 3: Compras, proveedores y costos

## Alcance entregado

- Registro, edición, listado y desactivación de proveedores por empresa.
- Registro de compras por sucursal con factura, boleta, nota de venta u otro documento.
- Recepción de mercadería con actualización transaccional de `producto_stock`.
- Cálculo de IGV según la afectación configurada en el catálogo (gravado 10, exonerado 20, inafecto 30).
- Costo unitario de compra capturado con IGV incluido y costo promedio ponderado independiente por sucursal.
- Pagos al contado, pagos parciales y saldo pendiente de proveedor.
- Salidas de caja auditables para pagos realizados en efectivo, tarjeta, Yape o Plin; las transferencias bancarias no alteran caja.
- Anulación restringida: solo se permite cuando no hay pagos y cuando las salidas de inventario posteriores no hacen insegura la reversión.
- Captura del costo promedio en cada línea de venta para conservar rentabilidad histórica.
- Reporte administrativo de ventas netas, costo, utilidad bruta y margen por producto.

## Migración

La migración nueva es `1700000000004-compras-proveedores-costos.ts`. Se ejecuta después de las migraciones iniciales, integridad de ventas y stock multisucursal (`1700000000000` a `1700000000003`).

1. Realice una copia de seguridad de PostgreSQL.
2. Confirme que la etapa 2 ya fue aplicada y que `producto_stock` contiene el inventario correcto por sucursal.
3. Configure `backend/.env` con los datos de PostgreSQL.
4. Ejecute desde `backend`: `npm ci` y luego `npm run migration:run`.
5. Reinicie backend y frontend para que aparezca el menú **Compras y proveedores** (solo ADMIN).

No vuelva a ejecutar el SQL inicial manualmente ni elimine tablas existentes. El gestor de migraciones aplica solo las pendientes.

## Reglas contables y operativas

- El costo unitario se registra en soles y **con IGV incluido**; el sistema separa base e IGV en la compra.
- El costo promedio ponderado se calcula con el costo unitario recibido y las existencias de esa sucursal.
- Ventas nuevas guardan una fotografía del costo promedio utilizado en el momento de vender. Las ventas antiguas no se recalculan retroactivamente.
- El costo promedio de stock heredado parte en cero porque el esquema anterior no guardaba costo fiable. Registre una compra real para empezar a poblarlo. No introduzca costos ficticios para “completar” reportes.
- Para pagos de caja, el servidor exige una caja abierta que pertenezca al usuario y sucursal; además comprueba que el efectivo disponible alcance para una salida en efectivo.
- Una compra pagada no se puede anular con este flujo. Tampoco se permite revertirla si existen salidas de stock posteriores. Esto protege la contabilidad y existencias. La devolución formal al proveedor requiere un flujo específico posterior.
- El documento del proveedor se valida como dato comercial; no sustituye la validación tributaria del comprobante frente a SUNAT.

## Endpoints

Ver `API.md`, sección **Compras, proveedores y cuentas por pagar**. El reporte de rentabilidad se publica en `GET /api/ventas/rentabilidad` (solo ADMIN).

## Validaciones y límites de esta entrega

Se ejecutó revisión de sintaxis/transpilación TypeScript/TSX y pruebas directas del motor de cálculo de compra/costo promedio. No se pudo completar `npm ci` en este entorno y no se dispone de un PostgreSQL de prueba; por ello, la compilación completa, ejecución de migraciones y pruebas integrales quedan pendientes en una instalación de validación.

La facturación electrónica real, firma digital y envío a SUNAT/OSE siguen sin estar habilitados. Esta entrega no debe utilizarse como emisor tributario de producción hasta integrar y probar un proveedor autorizado y certificado digital.
