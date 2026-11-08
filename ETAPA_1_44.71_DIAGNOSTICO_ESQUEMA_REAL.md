# Etapa 1.44.71 — Diagnóstico del esquema real

Esta etapa entrega una consulta SQL de solo lectura para conocer el esquema real de devoluciones en Supabase. Revisa 18 tablas relacionadas con comprobantes, devoluciones, caja, inventario, lotes, cuentas por cobrar y usuarios.

## Cómo usarlo
1. Descomprime el ZIP.
2. Abre `supabase/diagnosticos/20261107_devoluciones_esquema_solo_lectura.sql`.
3. Copia el contenido en Supabase → SQL Editor → New query.
4. Ejecuta la consulta. No contiene migraciones ni escrituras.
5. Comparte el resultado JSON aquí para adaptar el RPC transaccional a las columnas y restricciones reales.

No ejecutar todavía las migraciones de `migrations-preview`. El diagnóstico no habilita el botón Registrar; esa protección se mantiene hasta validar el RPC completo en staging.
