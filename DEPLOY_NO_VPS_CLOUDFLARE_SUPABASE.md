# Despliegue objetivo sin VPS — Cloudflare + Supabase

> Esta guía define la arquitectura final deseada. La versión 1.44.76 aún tiene módulos heredados que no cumplen el despliegue sin VPS; revisa primero `AUDITORIA_NO_VPS_1.44.76.md`. No publicar como POS completo hasta cerrar esos bloqueos.

## Arquitectura de producción

- Cloudflare Pages: frontend compilado (`frontend/dist`).
- Cloudflare Pages Functions / Workers: endpoints `/api/edge/*` y futuras rutas migradas.
- Supabase: Auth y PostgreSQL. Las RPC deben derivar identidad con `auth.uid()`, comprobar empresa/sucursal y aplicar transacciones/idempotencia en SQL.
- Cloudflare Workers/Queues o tareas programadas en Supabase: alertas, comprobantes y procesos asíncronos sin NestJS/Redis.

## Variables de entorno

En Cloudflare Pages, las variables públicas de compilación, cuando se habilite el modo Supabase en el entorno de staging, son:

- `VITE_API_URL=/api`
- `VITE_DEMO_MODE=false`
- `VITE_AUTH_PROVIDER=supabase`

Variables privadas de Pages Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (o la publishable key compatible)
- `SUPABASE_RPC_ALLOWLIST` únicamente con RPC revisadas y probadas.

Nunca incluir `SUPABASE_SERVICE_ROLE_KEY`, secretos OSE, SMTP o WhatsApp en variables `VITE_*` ni en el bundle del navegador. La service role, cuando sea imprescindible para un Worker privilegiado, debe guardarse exclusivamente como secret de ese Worker y limitarse a RPC aprobadas.

**No configurar `API_ORIGIN` ni `POS_API_ORIGIN` en un despliegue sin VPS.** La ausencia de esas variables hace fallar de forma explícita las rutas heredadas; no las convierte automáticamente en serverless.

## Publicación de Pages

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Configuración Wrangler: `frontend/wrangler.toml`

## Condiciones previas obligatorias

1. Completar el 100% de rutas usadas por el frontend sin fallback a NestJS.
2. Completar el registro transaccional de ventas y devoluciones, junto con crédito/cobranzas e inventario.
3. Migrar administración, reportes, alertas, facturación electrónica y notificaciones.
4. Validar políticas RLS y permisos de cada RPC en Supabase staging.
5. Ejecutar build, pruebas unitarias, integración, concurrencia e idempotencia.
6. Confirmar manualmente venta, cobro mixto, cierre de caja, devolución, reembolso, compras, inventario y reportes desde PC y Android.

## Verificación de aceptación

El despliegue se considera verdaderamente sin VPS solo cuando:

- La aplicación carga y autentica con `API_ORIGIN` y `POS_API_ORIGIN` ausentes.
- Cada módulo operativo no migrado aún está bloqueado con un mensaje explícito (nunca guarda datos falsos ni cae silenciosamente en demo).
- Todas las operaciones disponibles usan rutas Edge/Supabase y reglas SQL autenticadas.
- Las pruebas de integración confirman que cada transacción afecta una sola vez comprobantes, pagos, caja, inventario y cuentas.
- Los logs de Cloudflare y Supabase permiten diagnosticar errores sin registrar tokens ni datos personales.

No ejecutar migraciones de este ZIP en producción siguiendo únicamente esta guía.
