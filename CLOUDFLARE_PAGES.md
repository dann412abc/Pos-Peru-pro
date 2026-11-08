# Cloudflare Pages

Ver la guía de implementación de la versión vigente: [CLOUDFLARE_PAGES_1.44.77.md](CLOUDFLARE_PAGES_1.44.77.md).

Configuración: root `frontend`, build `npm ci && npm run build`, output `dist`. Las Pages Functions se publican desde `frontend/functions` cuando se despliega el proyecto completo (Git/Wrangler), no al cargar únicamente `dist`.
