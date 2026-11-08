# Mi Carrito POS v1.44.0

- Inicio de migración gradual a Supabase + Cloudflare sin VPS.
- Pages Function Edge API: health, validación de Supabase Auth y RPC con allowlist.
- Worker independiente preparado para Queue y Cron con allowlists y secretos server-side.
- Preview SQL para vínculo de identidad Supabase Auth.
- Documentación de arquitectura, variables, riesgos y mapa de módulos.
- Se mantiene el proxy NestJS para no romper operaciones aún no migradas.

## Limitaciones conocidas
La aplicación todavía depende del backend NestJS para módulos de negocio. No retirar VPS/backend ni API_ORIGIN hasta migrar y probar todos los módulos. No se ejecutaron migraciones ni despliegues.
