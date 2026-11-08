# v1.44.49 — Escritura transaccional de inventario y lotes FEFO

## Alcance

Se amplía el helper interno `pos_venta_insertar_documento_pagos_interno` para que la misma transacción que inserta comprobante, líneas y pagos también:

- Bloquee los saldos de producto/variante en orden determinista por producto y variante.
- Consolide líneas repetidas antes de descontar existencias.
- Descuente `producto_stock` para productos base y `producto_variante_stock` exclusivamente para variantes.
- Distribuya cada salida entre lotes por FEFO: vencimiento ascendente, luego ID ascendente; lotes sin fecha quedan al final.
- Excluya lotes vencidos y lotes de otra sucursal, empresa, producto o variante.
- Registre `comprobante_lote_salida` por cada asignación y un `movimiento_inventario` de salida por producto/variante.

## Política de seguridad e integridad

Si el saldo cambia, falta un lote utilizable o el inventario por lotes no alcanza la cantidad solicitada, se lanza una excepción. La excepción debe propagarse: PostgreSQL revierte cabecera, líneas, pagos, correlativo, saldos, lotes y movimientos en la misma transacción.

No se permite completar una venta desde stock sin trazabilidad de lotes. Los lotes vencidos no se venden. La selección de lotes usa `FOR UPDATE` y orden FEFO estable.

## Límites restantes

Este helper sigue sin ser invocable por `PUBLIC`, `anon` ni `authenticated`. Todavía no registra movimientos de caja ni crea cuentas por cobrar. Por tanto, no representa todavía una venta completa y no debe conectarse al botón Cobrar. La siguiente etapa debe cerrar caja/pagos y crédito en la misma transacción y validar la compatibilidad de esquema en PostgreSQL staging.

## Validación

Incluye pruebas estáticas Node.js. No se ejecutó el SQL en Supabase/PostgreSQL ni se desplegó Cloudflare. Mantener todas las migraciones en `migrations-preview` hasta completar pruebas de integración en staging.
