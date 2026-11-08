# Etapa 1.44.64 — Historial persistente de caja

La pantalla de caja ya no depende de la memoria de la sesión para mostrar movimientos en modo Supabase: al recargar, solicita el historial autorizado al servidor. La RPC devuelve como máximo 100 movimientos ordenados del más reciente al más antiguo.

## Contrato
- GET `/api/edge/cash/movements?cajaId=<id>`
- RPC `public.pos_caja_movimientos_listar_auth(integer)`
- Campos: `id`, `tipo`, `metodoPago`, `monto`, `motivo`, `createdAt`.

## Precaución
La migración es de preparación. No ejecutar hasta validar nombres/tipos de columnas contra el esquema de staging.
