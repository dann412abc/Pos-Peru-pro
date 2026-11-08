# Mi Carrito POS v1.7.0 — Controles de autorización

## Cambios

- Solo ADMIN puede aplicar descuentos en una venta. El backend valida el rol desde el JWT para cada solicitud, incluso si se altera el frontend.
- Un descuento requiere motivo de 5 a 250 caracteres; se guarda en `comprobante.motivo_descuento` con usuario, sucursal y fecha de la venta ya registrados.
- Solo ADMIN puede crear ingresos/egresos manuales de caja. Lectura de movimientos, apertura y cierre de la caja propia siguen disponibles para CAJERO.
- Los endpoints de anulaciones, ajustes/traslados de inventario, compras y devoluciones ya estaban restringidos a ADMIN.

## Actualización desde v1.6.0

1. Respaldar PostgreSQL.
2. Desplegar backend y frontend v1.7.0.
3. En `backend`, ejecutar `npm run migration:run`. La migración nueva es `1700000000008-autorizacion-descuentos.ts`; solo agrega una columna nullable y conserva comprobantes históricos.
4. No volver a ejecutar el SQL inicial.

La migración `down` se protege y rechaza revertirse si ya existen comprobantes con motivos de descuento, para no borrar su registro de auditoría.

## Verificación

Se añadieron pruebas unitarias de autorización para los descuentos enviados por cajero, motivo faltante y acceso autorizado antes de validar sucursal. El entorno de trabajo no contiene las dependencias de npm, por lo que debe ejecutarse `npm test` y los builds al instalar dependencias. No se probó con PostgreSQL real.
