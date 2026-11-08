# Etapa 37 — Alertas automáticas en segundo plano

- Se trasladó al backend la construcción de alertas de inventario, variantes, vencimientos, CxC/CxP, gastos, cajas, costos faltantes y mermas.
- Un endpoint interno protegido con `CRON_SECRET` sincroniza alertas para cada administrador activo y sus sucursales autorizadas.
- Se añadió un Cloudflare Worker con Cron Trigger cada cinco minutos. El Worker no accede directamente a Supabase ni contiene credenciales de base de datos.
- La bandeja se mantiene en `alerta_operativa`; la migración 0022 debe estar aplicada previamente.

**Dependencia operativa:** el Worker llama a la API NestJS, que debe seguir disponible en un runtime Node persistente. Cloudflare Pages no ejecuta NestJS ni Bull/Redis.
