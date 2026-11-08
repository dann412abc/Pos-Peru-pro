# Etapa 43 — Paquete de consolidación 1.43.0

Este paquete consolida las siete etapas planificadas (37–43) en una sola versión. Incluye cambios de backend, interfaz, Worker programado, documentación de configuración y checklist de puesta en marcha.

## Importante antes de producción
1. Revisar y aplicar en orden las migraciones pendientes, incluida la 0022 (alertas) y 0023 (marcar FE simulado), en una base de prueba primero.
2. Configurar `CRON_SECRET`, SMTP y WhatsApp en el backend, y los secretos del Worker.
3. Mantener la OSE en modo mock hasta contratar/configurar y validar la integración real.
4. Desplegar el frontend en Cloudflare Pages y el Worker de cron por separado.
5. Mantener la API NestJS y Bull/Redis en un runtime compatible; no basta con Cloudflare Pages.
6. Ejecutar build, pruebas, smoke test web/Android y respaldo/restauración antes de abrir al negocio.

El ZIP no ejecuta migraciones ni despliega servicios.
