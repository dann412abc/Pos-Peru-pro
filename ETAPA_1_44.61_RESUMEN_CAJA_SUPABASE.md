# Etapa 1.44.61 — Resumen autenticado de caja

## Alcance
Lectura segura del resumen de una caja en Supabase y transporte mediante Cloudflare Edge.

## Contrato
`GET /api/edge/cash/summary?cajaId=<id>` requiere Bearer Supabase. Cloudflare llama `pos_caja_resumen_auth(p_caja_id)`; SQL obtiene el usuario por `auth.uid()`, valida empresa, sucursal asignada y propiedad de caja.

## Respuesta
`cantidadVentas`, `totalVentas`, `totalDevoluciones` (temporalmente cero), `porMetodo` (EFECTIVO, TARJETA, YAPE, PLIN, CREDITO) y `efectivoEsperado`.

## Importante
No es todavía un cierre de caja integral. No hay escrituras de apertura, movimientos ni cierre por Supabase en esta etapa. Las devoluciones/reembolsos todavía no se descuentan de este resumen. Instalar solo en staging tras revisar el esquema real. No ejecutar en producción.
