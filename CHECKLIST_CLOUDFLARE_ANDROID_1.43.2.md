# Checklist de publicación — v1.43.2

## Antes de desplegar
- [ ] Backend Node persistente desplegado y con HTTPS.
- [ ] PostgreSQL Supabase accesible por SSL desde backend.
- [ ] Redis/Bull operativo.
- [ ] `CORS_ORIGIN` incluye el origen Pages exacto.
- [ ] `GET /api/health` devuelve 200 y baseDeDatos=ok.
- [ ] Backup de staging y revisión de migraciones completados.
- [ ] `OSE_MOCK=true` se mantiene hasta integrar OSE real.

## Cloudflare Pages
- [ ] Root directory: `frontend`.
- [ ] Build: `npm ci && npm run build`.
- [ ] Output: `dist`.
- [ ] Build vars: `VITE_API_URL=/api`, `VITE_DEMO_MODE=false`.
- [ ] Runtime var: `API_ORIGIN=https://api-pos...` sin ruta.
- [ ] Función `/api/*` aparece en Pages Functions.
- [ ] Deploy Preview probado antes de Production.
- [ ] Dominio propio vinculado y TLS activo.

## Android
- [ ] Inicio de sesión correcto.
- [ ] Rutas internas sobreviven al refresco.
- [ ] API /api/health accesible desde el mismo dominio.
- [ ] Productos, ventas, caja e inventario probados en staging.
- [ ] Cámara/lector de barras probado bajo HTTPS.
- [ ] Sin errores 4xx/5xx inesperados en Pages Functions.
- [ ] Sin secretos en el bundle frontend.

## No habilitar todavía
- [ ] Emisión SUNAT real (adaptador OSE real pendiente).
- [ ] Migraciones productivas sin revisión y autorización expresa.
