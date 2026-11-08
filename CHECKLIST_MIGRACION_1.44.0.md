# Checklist de avance sin VPS

## Cloudflare Pages — variables de entorno
- [ ] `SUPABASE_URL` (HTTPS)
- [ ] `SUPABASE_ANON_KEY` (publicable/anon; nunca service_role)
- [ ] `SUPABASE_RPC_ALLOWLIST` vacía hasta aprobar RPC
- [ ] `API_ORIGIN` temporal para endpoints que aún dependen de NestJS

## Worker de procesos
- [ ] Crear Queue `mi-carrito-pos-jobs` y DLQ
- [ ] Desplegar `cloudflare/worker` como Worker separado
- [ ] Configurar secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Mantener allowlists vacías hasta que existan RPC SQL auditadas
- [ ] Activar Cron solo después de aprobar sus RPC

## Pruebas obligatorias antes de cambiar login
- [ ] Usuario válido/expirado/desactivado
- [ ] Usuario sin vínculo POS
- [ ] Usuario de empresa A intentando leer empresa B
- [ ] Usuario de sucursal A intentando operar en sucursal B
- [ ] Refresh, logout y recuperación de contraseña
- [ ] Revocación de sesión

## No activar todavía
- [ ] No cambiar `VITE_API_URL` a `/api/edge`
- [ ] No retirar NestJS ni `API_ORIGIN`
- [ ] No activar RLS genérico sin revisar esquema y políticas por tabla
- [ ] No agregar funciones SQL a allowlists sin pruebas de autorización e idempotencia
- [ ] No apagar Redis hasta migrar productores y consumidores
