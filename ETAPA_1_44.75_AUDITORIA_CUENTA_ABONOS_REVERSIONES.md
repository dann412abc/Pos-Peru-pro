# Etapa 1.44.75 — auditoría por cuenta de crédito, abonos y reversiones

Se agrega un diagnóstico SQL de solo lectura que desglosa cada cuenta por cobrar visible según RLS y concilia:

- Crédito original (`total_credito`).
- Saldo pendiente vigente (`saldo_pendiente`).
- Abonos registrados en `cobro_cliente`, separados por efectivo, Yape, Plin, tarjeta y transferencia.
- Monto revertido informado en `monto_revertido`.
- Diferencia preliminar entre crédito menos abonos y saldo vigente.

La clasificación `COINCIDE_CON_REVERSION_REGISTRADA`, `COINCIDE_SIN_AJUSTE` o `REQUIERE_REVISION_DOCUMENTAL` es orientativa. No determina por sí sola un error: cada diferencia debe verificarse contra el comprobante y las devoluciones asociadas.

**Seguridad:** ejecutar con JWT de usuario `authenticated`; no usar `service_role` ni `postgres` para validar RLS. La consulta no modifica datos, no crea funciones y no aplica migraciones.

Archivo: `supabase/diagnosticos/20261108_conciliacion_cuenta_abonos_reversiones_solo_lectura.sql`.
