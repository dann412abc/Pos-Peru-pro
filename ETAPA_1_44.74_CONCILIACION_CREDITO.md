# Etapa 1.44.74 — conciliación de saldos de crédito

Se incorpora un diagnóstico SQL estrictamente de solo lectura para comparar `cliente.saldo_credito` contra la suma de `cuenta_cobrar.saldo_pendiente` por empresa y cliente.

- Filtra cuentas anuladas y pagadas de la suma pendiente.
- Muestra cuentas con saldo, estados observados, monto revertido acumulado y última actualización.
- Clasifica diferencias mayores a S/ 0.01.
- No corrige saldos ni ejecuta migraciones.
- Se debe ejecutar con JWT de un usuario autenticado para evaluar RLS. Un resultado vacío no demuestra visibilidad completa de todas las sucursales.

Archivo: `supabase/diagnosticos/20261108_conciliacion_saldo_credito_solo_lectura.sql`.

## Limitación
La conciliación no debe usarse para actualizar saldos automáticamente. Primero se deben contrastar las diferencias con los comprobantes, abonos y devoluciones de cada cliente. El tratamiento de `monto_revertido` se presenta como dato auxiliar y no se suma ni resta otra vez del saldo pendiente, porque el campo `saldo_pendiente` ya representa el saldo vigente.
