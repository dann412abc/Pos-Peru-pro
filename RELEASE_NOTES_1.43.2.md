# Mi Carrito POS v1.43.2

Preparación de publicación HTTPS en Cloudflare Pages para acceso desde Android.

- Documentación paso a paso para Pages, backend NestJS persistente, Supabase, Redis y Cloudflare Tunnel.
- Variables de ejemplo frontend preparadas para same-origin `/api` y modo demo desactivado.
- Cabeceras HTTP de seguridad para Pages, política de caché para `index.html` y assets versionados.
- Checklist de validación previa a producción y pruebas Android.
- No se desplegaron recursos remotos ni se ejecutaron migraciones.

Limitaciones: backend Node/Redis sigue siendo externo a Pages; SUNAT/OSE continúa en modo simulado; build completo requiere instalación limpia de dependencias.
