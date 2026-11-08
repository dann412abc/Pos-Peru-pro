# Detalle oficial de comprobantes Supabase — v1.44.57

## Objetivo
La recuperación de una venta confirmada ya no depende de que el navegador conserve una copia completa del ticket. Después de consultar la clave idempotente, el POS recupera el detalle oficial del comprobante desde PostgreSQL.

## RPC de solo lectura
- `public.pos_comprobante_detalle_auth(p_comprobante_id integer) RETURNS jsonb`.
- `SECURITY DEFINER`, `search_path` fijo y `auth.uid()` como fuente de identidad.
- Deriva usuario y empresa desde `usuario.supabase_auth_user_id`.
- Restringe el comprobante a la empresa del usuario y a una sucursal incluida en `usuario_sucursal`.
- Devuelve cabecera, cliente, líneas, variantes, importes IGV, pagos, estado electrónico y comprobante de referencia.
- No acepta `empresa_id`, `usuario_id` ni `sucursal_id` como parámetros del navegador.
- Revoca `PUBLIC` y `anon`; concede ejecución a `authenticated`.
- No modifica comprobantes, stock, lotes, pagos, caja ni correlativos.

## Cloudflare Edge
`POST /api/edge/sales/comprobante-detail` valida el Bearer y el ID positivo y reenvía únicamente `p_comprobante_id` a la RPC usando `SUPABASE_ANON_KEY` y el JWT del usuario. No usa `service_role`.

## Frontend
- La recuperación automática primero consulta el estado idempotente.
- Si existe, obtiene el detalle oficial y lo transforma con `mapComprobante`.
- Solo después de guardar el comprobante completo en IndexedDB limpia el intento pendiente y muestra el ticket.
- Si el detalle no está disponible o llega incompleto, conserva el intento y bloquea nuevos cobros.
- El snapshot local queda como respaldo de diagnóstico, no como fuente de verdad del comprobante recuperado.

## Validación y límites
- Pruebas estáticas Node y Edge incluidas en el paquete.
- No se ejecutó SQL en Supabase ni se probó contra una base remota.
- Build completo y Vitest de frontend dependen de instalar las dependencias npm; no se afirma validación runtime.
- No se desplegó Cloudflare y `VITE_SUPABASE_SALES_ENABLED` permanece deshabilitado.
- El SQL está en `supabase/migrations-preview/` y requiere revisión/ejecución manual posterior en staging.
