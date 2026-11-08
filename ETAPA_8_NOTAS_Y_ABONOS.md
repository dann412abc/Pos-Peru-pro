# Mi Carrito POS v1.8.0 — Notas y cuentas por cobrar

## Alcance

- Un ADMIN puede emitir una nota de crédito desde una devolución ya registrada. Se vincula tanto a la devolución como a la factura/boleta original y usa los códigos SUNAT 06 (devolución total) o 07 (devolución parcial).
- La nota de crédito es documental: no repite los movimientos de caja, inventario ni cuenta por cobrar que ya ejecutó la devolución. La devolución aplica primero contra el saldo de la cuenta, después del abono inicial y de cobranzas parciales; el excedente se paga mediante el reembolso registrado.
- Un ADMIN puede emitir nota de débito por aumento de valor, código 02, sobre una línea elegida del comprobante, indicando importe y sustento. Se crea una cuenta por cobrar independiente a 30 días y aumenta el saldo consolidado del cliente. Las cobranzas parciales y su historial se mantienen en Cobranzas.
- Ambas notas generan XML UBL 2.1 con referencia al comprobante y respuesta/motivo. Se aseguran las series NC01 y ND01 por sucursal.
- Venta Rápida ahora filtra el indicador activo en los registros de IndexedDB sin intentar tratar un booleano como clave numérica; esto vuelve visibles los productos demo existentes y conserva la búsqueda por nombre/código.

## Instalación desde v1.7.0

1. Respaldar PostgreSQL.
2. Desplegar backend y frontend v1.8.0.
3. En `backend`, ejecutar `npm run migration:run`; se aplicará `1700000000009-notas-credito-debito.ts`.
4. No ejecutar de nuevo el SQL inicial ni borrar volúmenes.

La migración agrega columnas y restricciones de referencia y crea las series faltantes sin reiniciar correlativos existentes. El `down` se detiene si existen notas vinculadas. Las series agregadas pueden permanecer después de una reversión para evitar eliminar configuración previa.

## Verificación y límites

Se añadieron pruebas unitarias que comprueban que las notas NC/ND produzcan XML parseable y contengan referencia, tipo y motivo. Este entorno carece de dependencias npm, así que no se ejecutaron Jest, builds ni integración PostgreSQL. No se validó el XML con XSD/validador SUNAT. El firmador y OSE siguen siendo MOCK; esta entrega no está certificada para emitir comprobantes tributarios.

El catálogo de productos aún no agrupa variantes de talla/color/tamaño; cada combinación se representa manualmente como un SKU separado. Eso queda como una etapa de producto posterior.
