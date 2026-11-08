# Mi Carrito POS v1.5.0 — Etapa 5: devoluciones de clientes

## Alcance

Esta etapa incorpora devoluciones parciales o totales vinculadas al comprobante original. Se puede decidir por línea si el producto vuelve o no al inventario vendible. El servidor calcula cantidades e importes; los importes del navegador son solo una estimación visual.

La devolución se distribuye de esta forma:

1. Primero reduce el saldo pendiente de crédito de la venta original.
2. Solo la diferencia se reembolsa por uno o más medios: efectivo, tarjeta, Yape o Plin.
3. Yape y Plin exigen número de operación/referencia.
4. Si se reingresa el producto, se actualiza `producto_stock` en la sucursal original y se crea un movimiento de inventario.
5. Cada medio reembolsado genera una salida en `caja_movimiento` ligada a la devolución y a la caja abierta del usuario.

## Permisos y trazabilidad

- `POST /api/devoluciones/ventas/:comprobanteId`: solo rol `ADMIN`.
- Consultas: autenticación JWT y filtro por empresa/sucursales asignadas.
- Toda operación exige una caja abierta del usuario en la sucursal de la venta.
- La clave `idempotencyKey` debe mantenerse exactamente igual ante un timeout o corte de conexión. No genere otra clave hasta comprobar el historial.
- Una clave usada con un cuerpo diferente se rechaza como conflicto.
- La anulación simple de una venta con devoluciones queda bloqueada para impedir el doble reingreso de stock o reembolso.
- La cuenta de crédito cerrada por una devolución usa estado `AJUSTADA`; esto no se registra como dinero cobrado.

## Migración

La migración nueva es `backend/src/database/migrations/1700000000006-devoluciones-ventas.ts`.

1. Realice respaldo de PostgreSQL.
2. Restaure ese respaldo en una base de staging.
3. Instale dependencias en backend y frontend (`npm ci` en cada carpeta).
4. Configure el `.env` del backend para staging.
5. Ejecute `npm run migration:run` desde `backend`.
6. Ejecute `npm run build` y `npm test` desde `backend`, y `npm run build` desde `frontend`.
7. Pruebe devolución parcial, devolución total, reintento exacto, clave reutilizada con datos diferentes, compensación de crédito, reembolso efectivo sin saldo suficiente, Yape/Plin sin referencia, reingreso/no reingreso y visibilidad multiempresa.
8. Solo después de aprobar staging, planifique la actualización de producción.

No ejecute el SQL inicial de nuevo ni borre tablas existentes.

## Limitaciones conocidas

- Esta devolución es un movimiento comercial/contable interno del POS. Todavía no genera una nota de crédito UBL firmada, no la envía a una OSE y no obtiene CDR real de SUNAT.
- Las devoluciones a proveedores y el control de lotes/fechas de vencimiento son etapas separadas; no están incluidas en v1.5.0.
- No se completó compilación integral ni prueba PostgreSQL en el entorno de construcción por ausencia de dependencias npm instaladas y de una instancia de base de datos. El análisis sintáctico de TypeScript/TSX y los cálculos puros sí se ejecutaron.
