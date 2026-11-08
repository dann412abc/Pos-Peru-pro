# Release 1.44.77 — Cloudflare Pages sin VPS

- Alineada la versión raíz, frontend, backend y lockfiles en 1.44.77.
- Añadido endpoint de diagnóstico `GET /api/health`.
- Añadida guía de despliegue Cloudflare Pages con root `frontend`, build `npm ci && npm run build` y output `dist`.
- Documentado uso de Preview con modo demo explícito y Production sin datos demo.
- Documentados secretos runtime Supabase y prohibición de exponer service-role.
- Se mantiene deshabilitada la autenticación Supabase en frontend hasta validar el RPC de perfil y el esquema de identidad real.
- No se ejecutaron migraciones ni escrituras en la base Supabase.
- Limitaciones funcionales heredadas descritas sin declarar el POS completo listo para producción.
