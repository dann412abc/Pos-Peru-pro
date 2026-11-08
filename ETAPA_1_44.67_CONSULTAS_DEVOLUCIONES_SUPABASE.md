# Etapa 1.44.67 — Consultas seguras de devoluciones

Esta etapa prepara el lado de lectura de devoluciones para Supabase: historial, búsqueda de comprobantes y disponibilidad de cantidades/importe. Todas las consultas usan `auth.uid()`, el vínculo `usuario.supabase_auth_user_id`, usuario activo y sucursales autorizadas. Las funciones se conceden únicamente a `authenticated`.

**No habilita el registro de devoluciones.** La operación de escritura requiere una única RPC transaccional que coordine reembolso por medio de pago, crédito, caja, inventario/lotes, idempotencia y nota de crédito. El bloqueo preventivo de la pantalla sigue vigente en Supabase Auth.

Migración preview: `202611070046_returns_read_auth.sql`. Validar esquema real en staging antes de ejecutar. Sin cambios remotos realizados.
