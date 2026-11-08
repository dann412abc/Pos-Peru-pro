# Etapa 1.44.76 — Auditoría estructural de caja, cobranzas y devoluciones

Se agrega una consulta SQL de solo lectura que inspecciona las columnas, claves foráneas, restricciones, índices, políticas RLS, triggers y definiciones de funciones vinculadas a caja, abonos y devoluciones.

## Propósito

Antes de comparar importes, se necesita confirmar en la base real cómo se relacionan `cobro_cliente` con `caja_movimiento` y `devolucion_venta_pago` con `devolucion_venta`/`caja`. No se debe asumir que un reembolso aparece como fila física de `caja_movimiento`: el diseño previo lo representa como pago de devolución y lo incorpora al resumen/historial mediante consulta.

## Ejecución

Ejecutar `supabase/diagnosticos/20261108_auditoria_estructura_caja_cobros_devoluciones_solo_lectura.sql` en Supabase y compartir el JSON resultante. Usar una sesión autenticada para revisar el contexto de RLS. La inspección de catálogo puede variar según los permisos del rol.

## Seguridad

- Solo consulta metadatos de `public`.
- No lee importes ni datos personales de clientes.
- No modifica datos, esquema, permisos ni funciones.
- No se debe aplicar todavía el SQL de `supabase/migrations-preview/202611070045_cash_refund_reconciliation_auth.sql`: es una propuesta previa y debe contrastarse con el esquema real antes de considerar cualquier migración.

## Pruebas

Prueba estática de contrato: verifica tablas objetivo, inspección de RLS/constraints/indexes/triggers y ausencia de sentencias DDL/DML.
