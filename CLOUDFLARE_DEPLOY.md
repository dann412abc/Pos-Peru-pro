# Cloudflare Pages — Controla Ventas sin VPS

La configuración concreta de publicación para esta entrega está en [CLOUDFLARE_PAGES_1.44.77.md](CLOUDFLARE_PAGES_1.44.77.md).

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Pages Functions: `frontend/functions`
- No configurar `API_ORIGIN` ni `POS_API_ORIGIN`.

La versión 1.44.77 permite publicar la interfaz y las rutas Edge ya migradas sin un VPS. Usa el entorno Preview con modo demo para probar pantallas. No declara el POS completo listo para producción: la autenticación Supabase y varias operaciones transaccionales siguen bloqueadas por la auditoría 1.44.76.
