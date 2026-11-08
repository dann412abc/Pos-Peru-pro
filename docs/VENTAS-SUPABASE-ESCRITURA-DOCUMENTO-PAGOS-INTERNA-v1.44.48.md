# v1.44.48 — Primer bloque interno de escritura de ventas

## Alcance

Se incorpora `pos_venta_insertar_documento_pagos_interno`, helper `SECURITY DEFINER` no expuesto a `PUBLIC`, `anon` ni `authenticated`. Está diseñado para ser llamado únicamente por una futura RPC pública autenticada que mantenga una única transacción PostgreSQL abierta.

En esta etapa inserta:
- Cabecera de comprobante (boleta/factura).
- Líneas con importes calculados por el motor SQL y costos leídos del stock.
- Pagos normalizados.
- Correlativo atómico por `UPDATE ... RETURNING`.
- Clave idempotente y huella SHA-256.

También vuelve a comprobar la clave idempotente, aplica la autorización de descuentos (solo ADMIN y motivo obligatorio) y devuelve identificadores del documento.

## Límites deliberados

Este helper **no es una RPC pública y no puede ejecutarse desde el navegador**. No concede permisos a roles cliente. No es todavía una venta completa: no descuenta stock, no consume lotes FEFO, no crea movimientos de inventario, no crea movimientos de caja y no crea cuentas por cobrar. El resultado indica `DOCUMENT_AND_PAYMENTS_INSERTED_PENDING_REMAINDER`; no debe mostrarse como venta confirmada.

La futura RPC orquestadora deberá invocar este helper y completar inventario, lotes, caja y crédito dentro de la misma transacción. Si cualquiera de esos pasos falla, la excepción debe propagarse para que PostgreSQL revierta también cabecera, líneas, pagos y correlativo.

## Compatibilidad

Usa las tablas/columnas del esquema español singular ya definido por las migraciones TypeORM. Solo acepta comprobantes `01` y `03`, con series `F001` y `B001`. Nota de venta sigue fuera del CHECK actual y no se convierte a boleta.

## Validación realizada

Pruebas estáticas Node.js. No se ha ejecutado este SQL contra PostgreSQL/Supabase. Requiere prueba de integración en staging antes de cualquier despliegue o habilitación de Cobrar.
