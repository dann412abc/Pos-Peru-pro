# Mi Carrito POS 1.43.0 — Consolidación de etapas 37–43

## Incorporado
- Alertas operativas generadas desde backend y sincronización programada cada cinco minutos mediante Cloudflare Worker + endpoint con secreto dedicado.
- Configuración de SMTP y WhatsApp Business desde secretos del backend, estado sin secretos y envío de mensajes de prueba protegido para ADMIN. WhatsApp usa Graph API v26.0 por defecto y plantillas aprobadas configurables.
- Envío automático de comprobantes por email y WhatsApp con interruptores de entorno independientes.
- Datos de empresa sincronizables entre backend y dispositivo; actualización fiscal protegida por rol ADMIN y campo Ubigeo.
- Administración de usuarios: creación, cambio de rol/sucursales, activación/desactivación y restablecimiento de contraseña; aislamiento de sucursales por empresa.
- Comprobantes marcados como simulados cuando responde el adaptador OSE MOCK; aviso explícito en pantalla y PDF stub. Las aceptaciones simuladas no disparan comunicaciones automáticas al cliente.
- Documentación de despliegue final y checklist para Supabase, backend y Cloudflare.

## Migraciones nuevas/pendientes
- `1710000000023-marca-comprobantes-simulados.ts`.
- La etapa anterior ya agregó `1710000000022-alertas-operativas-persistentes.ts`.

No ejecutar migraciones sin respaldo, staging y autorización. No se modificó Supabase ni se desplegó Cloudflare.

## Limitaciones de producción
La integración SUNAT sigue en MOCK y no tiene certificado ni proveedor real configurado. El backend NestJS y su cola Bull/Redis siguen necesitando un runtime compatible; Cloudflare Pages y el Worker de cron no sustituyen esa API. No es aún un sistema listo para emitir comprobantes tributarios reales.
