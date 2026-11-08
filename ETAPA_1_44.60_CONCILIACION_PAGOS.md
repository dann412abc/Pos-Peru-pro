# Etapa 1.44.60 — Conciliación exacta de pagos

## Objetivo
Evitar que una venta se confirme con una suma de pagos diferente al total del comprobante.

## Cambio
`pos_venta_validar_pagos_interno` ahora exige `v_suma = v_total` después de normalizar ambos importes a dos decimales. Se elimina la tolerancia de S/ 0.01.

## Contratos verificados
- Efectivo: `montoRecibido >= monto`; vuelto = recibido − monto.
- Tarjeta, Yape y Plin: ingreso cobrado por el importe del medio.
- Crédito: no se considera ingreso inmediato; genera cuenta por cobrar y actualiza saldo del cliente.
- Caja: el escritor usa `comprobante_pago` como fuente de ingreso y no inserta un movimiento paralelo que duplique el importe.

## Pruebas y límites
Ejecutar desde `pos1457`:
```bash
node --test supabase/migrations-preview/*.test.mjs supabase/tests/*.test.mjs
```
Estas pruebas son principalmente estáticas sobre contratos SQL. No reemplazan pruebas de integración con PostgreSQL/Supabase.

No ejecutar migraciones ni activar `VITE_POS_SUPABASE_SALES` en producción. La etapa remota requiere una base de staging aislada, fixture revisado y autorización expresa.
