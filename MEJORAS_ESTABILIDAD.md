# Mi Carrito POS — mejoras de estabilidad

Esta entrega endurece el flujo transaccional del POS. Mantiene React/Vite, NestJS, PostgreSQL y la caché local IndexedDB; no cambia la estructura tecnológica principal.

## Cambios incorporados

### Ventas e inventario

- El correlativo se incrementa dentro de la misma transacción PostgreSQL que registra el comprobante.
- La sucursal, el cliente y los productos se validan contra la empresa del usuario.
- Los productos se bloquean en orden estable durante la venta y el descuento de stock es condicional (`stock >= cantidad`).
- Se registra un movimiento de inventario por cada salida de venta, reposición por anulación, stock inicial y ajuste manual de entrada/salida.
- El stock inicial al crear un producto queda registrado como entrada auditada; los ajustes manuales requieren motivo y rol ADMIN.
- El servidor vuelve a validar el precio del catálogo; rechaza precios enviados por el navegador que no coincidan con el precio vigente.
- Los reintentos aceptan `idempotencyKey` y tienen un índice único por empresa para impedir comprobantes duplicados.
- Se permite un medio de pago o varios medios desglosados (efectivo, tarjeta, Yape, Plin). El crédito no se combina con otros medios.
- Se impide emitir una nota de crédito o débito como si fuera una venta nueva. Esos documentos requieren un flujo que referencie el comprobante original.
- El descuento global se rechaza temporalmente en el endpoint de ventas para evitar generar bases imponibles/IGV inconsistentes en el XML. Los descuentos por línea siguen disponibles.

### Caja

- Las ventas se registran vinculadas a una caja abierta del usuario y sucursal.
- El cierre se calcula en PostgreSQL a partir de pagos desglosados y del libro de movimientos; no depende del resumen parcial del navegador.
- Los pagos al crédito no se consideran dinero recibido en caja.
- El arqueo de efectivo considera el saldo inicial, los cobros en efectivo y los ingresos/egresos.
- Se añadieron endpoints para registrar y consultar ingresos y egresos de caja. Los egresos en efectivo validan el saldo disponible.
- La pantalla de cierre consulta un resumen del turno completo, aunque cruce la medianoche, y permite registrar movimientos.
- Al anular una venta, el reembolso se registra como egreso por cada medio. Si el reembolso es en efectivo, se comprueba que exista disponibilidad antes de confirmar la anulación.

### Seguridad y operación

- Las búsquedas, actualizaciones y anulaciones de ventas quedan limitadas por empresa y sucursales asignadas.
- Los comprobantes electrónicos, sus PDF, reenvíos, notificaciones y el historial de envíos verifican empresa y sucursal antes de permitir acceso.
- Los reportes diarios y comunicaciones de baja quedan limitados a sucursales autorizadas; la comunicación de baja ya no anula ventas por su cuenta y solo admite comprobantes anulados previamente por el flujo transaccional.
- Los productos y clientes se consultan/actualizan dentro de la empresa del usuario.
- Se valida que una categoría de producto pertenezca a la misma empresa.
- La actualización de ficha de producto no permite alterar stock directamente; el stock requiere movimientos de inventario.
- En producción son obligatorios `DB_PASSWORD`, `CORS_ORIGIN` y secretos JWT diferentes de al menos 32 caracteres.
- El seed de demostración queda bloqueado con `NODE_ENV=production`.
- El modo demo del frontend se desactiva por defecto; la pantalla de acceso ya no cambia a usuarios demo cuando falla el backend.
- La cola offline marca como revisión manual los rechazos HTTP 4xx, en vez de reintentar indefinidamente. Se puede forzar un reintento desde la pantalla de facturación electrónica.

## Migración de base de datos

Se añadió:

`backend/src/database/migrations/1700000000002-integridad-ventas-pagos.ts`

La migración crea el desglose de pagos, el libro de movimientos de inventario, el libro de movimientos de caja, la clave de idempotencia y amplía el medio de pago del comprobante para aceptar `MIXTO`. También migra los pagos de comprobantes existentes.

Desde la carpeta `backend`, configurar el `.env` y ejecutar:

```bash
npm ci
npm run migration:run
```

La orden ejecuta únicamente migraciones pendientes. No vuelva a ejecutar manualmente el SQL inicial ni borre la base de datos existente. En una instalación nueva, `migration:run` ejecuta todas las migraciones en orden.

Para datos de demostración, solo en desarrollo:

```bash
npm run seed
```

No ejecute `seed` en producción. El seed contiene usuarios demo con contraseñas conocidas.

## Endpoints de caja añadidos

- `GET /api/caja/:id/resumen` — resumen del turno para el arqueo.
- `POST /api/caja/:id/movimientos` — registra `INGRESO` o `SALIDA`, con método, importe y motivo.
- `GET /api/caja/:id/movimientos` — consulta los movimientos de la caja.

## Endpoints de inventario añadidos

- `POST /api/inventario/movimientos` — registra entrada o salida manual (solo ADMIN), validando stock disponible y sucursal.
- `GET /api/inventario/movimientos` — consulta movimientos de las sucursales autorizadas, opcionalmente por `productoId`.
- `POST /api/inventario/transferencias` — transfiere líneas de productos entre dos sucursales autorizadas en una sola transacción; admite `idempotencyKey`.
- `GET /api/inventario/transferencias` — devuelve las últimas 100 transferencias entre sucursales a las que el usuario está asignado, con fecha, origen, destino, responsable, motivo y detalle de productos.

El inventario multisucursal se implementó en la Etapa 2. La fuente de verdad es `producto_stock`, con saldos independientes por producto y sucursal.

Ejemplo de ajuste de inventario:

```json
{
  "sucursalId": 1,
  "productoId": 25,
  "tipo": "SALIDA",
  "cantidad": 2,
  "motivo": "Merma por productos dañados"
}
```

Ejemplo de transferencia: ver `API.md`, sección Inventario por sucursal y traslados.

## Variables de producción

Además de los datos de conexión a PostgreSQL, configure valores propios:

```env
NODE_ENV=production
DB_PASSWORD=una_clave_larga_y_unica
JWT_ACCESS_SECRET=secreto_aleatorio_de_al_menos_32_caracteres
JWT_REFRESH_SECRET=otro_secreto_aleatorio_distinto_de_32_caracteres
CORS_ORIGIN=https://tu-dominio.example
```

No publique `.env`, claves privadas, tokens OSE ni certificados digitales dentro del ZIP o del repositorio.

## Pendientes antes de operar con dinero real

1. Certificar los XML UBL de notas y conectar el envío real al OSE/SUNAT. v1.8.0 agrega nota de crédito desde devolución y nota de débito por aumento de valor; no completa aún anulación formal mediante nota ni comunicación de baja tributaria.
2. Implementar firma digital real y conexión certificada con OSE/SUNAT. La integración OSE de esta base continúa en modo simulado; no emitir comprobantes tributarios reales con esta configuración.
3. Autorización por rol para descuentos, anulaciones, ajustes de inventario y movimientos manuales de caja. **Completado en v1.7.0**: descuentos y movimientos manuales requieren ADMIN; anulaciones y ajustes/transferencias ya lo requerían.
4. Compras, proveedores, ajustes, lotes/vencimientos y devoluciones están implementados en v1.3.0–v1.6.0; falta completar su verificación integral en PostgreSQL.
5. Completar la conciliación de medios no efectivos en el arqueo; la pantalla actual permite contar efectivo físicamente y toma los demás medios desde el registro del servidor.
6. Verificar reglas tributarias y XML UBL con casos reales y certificación del proveedor OSE.
7. Ejecutar pruebas de extremo a extremo contra PostgreSQL y Redis reales, incluyendo concurrencia, pérdida de conexión, devolución, anulación y recuperación offline.
8. Agregar variantes de producto (talla, color, tamaño/presentación): cada combinación debe conservar SKU/código de barras, precio/costo, existencias por sucursal y lotes propios, sin alterar los productos actuales.

## Verificación de esta entrega

La primera versión mejorada recibió una pasada sintáctica sobre 132 archivos TypeScript/TSX. En esta Etapa 2 se volvió a comprobar la sintaxis/transpilación de los 13 archivos modificados: sin errores de sintaxis en esa verificación. No se pudo completar `npm ci`, la compilación completa ni las pruebas unitarias/integrales porque el registro npm no respondió antes del límite de tiempo y el modo offline no tenía todos los paquetes en caché. Esta entrega requiere instalar dependencias y ejecutar builds, migraciones y pruebas contra PostgreSQL en un entorno con acceso a npm antes de desplegar.


## Etapa 2 — Inventario independiente por sucursal

Se agregó la migración `1700000000003-stock-por-sucursal`. El saldo ahora se administra en `producto_stock` por producto y sucursal; las ventas, anulaciones, ajustes y transferencias actualizan ese saldo dentro de transacciones. El selector de sucursal respeta las asignaciones del usuario y solo permite cambiar en línea. El criterio de transferencia del stock histórico y los pasos de instalación se encuentran en `ETAPA_2_INVENTARIO_MULTISUCURSAL.md`.

## Etapa 8 — notas vinculadas y cuentas por cobrar

La nota de crédito se emite desde una devolución registrada y hereda sus líneas, motivo e importe; no vuelve a contabilizar el reembolso ni la reducción del saldo. La nota de débito admitida es la de aumento de valor (código 02) y crea una cuenta por cobrar independiente. Las ventas mixtas ya registran el abono inmediato separado del saldo financiado y Cobranzas acepta abonos parciales idempotentes, por lo que los adelantos previos se preservan.

Para instalar, ejecute `1700000000009-notas-credito-debito.ts` en backend después de respaldar PostgreSQL. Añade referencias tributarias y series NC01/ND01. La reversión se detiene si ya hay notas vinculadas.

La firma digital y el OSE son MOCK. Aunque se construyen XML UBL de notas y hay pruebas unitarias de estructura/campos, no se declara validación contra esquemas SUNAT, certificación ni envío real. No se corrieron compilaciones ni pruebas PostgreSQL: este entorno no contiene dependencias npm instaladas.
