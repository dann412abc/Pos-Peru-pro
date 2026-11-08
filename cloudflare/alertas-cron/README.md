# Worker de alertas heredado — no usar en despliegue sin VPS

Este Worker corresponde a la arquitectura anterior: cada cinco minutos llama a `/api/internal/cron/alertas` en un backend NestJS externo mediante `POS_API_ORIGIN` y `CRON_SECRET`.

**No cumple el requisito de operar sin VPS. No desplegarlo ni configurar `POS_API_ORIGIN` para el entorno final.** Se conserva únicamente como referencia durante la migración.

La alternativa objetivo es trasladar el cálculo y persistencia de alertas a `cloudflare/worker` con Cron/Queues y RPC Supabase estrictas, o a tareas programadas compatibles con Supabase. Antes de activar debe existir una RPC concreta, auditada e idempotente, con permisos mínimos y pruebas de staging.

Consulta `AUDITORIA_NO_VPS_1.44.76.md` y `DEPLOY_NO_VPS_CLOUDFLARE_SUPABASE.md`.
