# Publicación de Mi Carrito POS en Cloudflare Pages para Android — v1.43.2

Esta guía prepara la publicación del frontend para que el POS se abra desde Android con una URL HTTPS. **No publica por sí sola el backend ni conecta una base de datos.** No ejecutar migraciones durante esta preparación.

## Arquitectura necesaria

- Cloudflare Pages: interfaz React/Vite y función proxy `/api/*`.
- Backend NestJS: servicio Node persistente, accesible por HTTPS (recomendado: subdominio dedicado detrás de Cloudflare Tunnel).
- Supabase: PostgreSQL. Mantener SSL y credenciales solo en el backend.
- Redis: requerido por la cola Bull del backend actual.

Ejemplo de dominios (reemplazar por los propios):
- Frontend: `https://pos.tudominio.pe`
- API: `https://api-pos.tudominio.pe`

## A. Preparar el backend antes de Pages

1. Desplegar `backend/` en un runtime Node persistente (no Cloudflare Pages).
2. Instalar dependencias con `npm ci` y compilar con `npm run build`.
3. Configurar las variables del backend a partir de `backend/.env.example`.
4. En producción usar `NODE_ENV=production`, `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=true`, `OSE_MOCK=true` y secretos JWT aleatorios, distintos y de al menos 32 caracteres.
5. Configurar `CORS_ORIGIN` con el origen exacto del frontend, por ejemplo `https://pos.tudominio.pe`. Si también se usará el dominio `*.pages.dev`, agregarlo separado por coma.
6. Mantener `REDIS_HOST/PORT/PASSWORD` apuntando a Redis accesible desde el backend.
7. Exponer el backend mediante Cloudflare Tunnel o un origen HTTPS equivalente. No publicar el puerto Node directamente sin controles.
8. Verificar desde un navegador: `https://api-pos.tudominio.pe/api/health`. Debe devolver HTTP 200 y `status: up`, `baseDeDatos: ok`.

No cambiar `OSE_MOCK` a `false`: el paquete todavía no incluye un adaptador OSE real. No configurar credenciales SUNAT como si ya estuviera habilitada la emisión real.

## B. Crear Cloudflare Pages

1. Subir el repositorio a GitHub o conectar el repositorio existente en Cloudflare Pages.
2. Crear un proyecto Pages desde el repositorio.
3. Configurar:
   - Root directory: `frontend`
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
4. Variables de entorno de **Build** para Production y Preview:
   - `VITE_API_URL` = `/api`
   - `VITE_DEMO_MODE` = `false`
5. Variables de entorno de **Functions/Runtime** para Production y Preview:
   - `API_ORIGIN` = `https://api-pos.tudominio.pe` (solo origen; sin `/api`, ruta, query ni barra final).
6. Desplegar primero en `*.pages.dev` y revisar logs de Pages Functions.

`API_ORIGIN` no es una clave de acceso, pero debe configurarse como variable de servidor y nunca con prefijo `VITE_`. No poner contraseñas, JWT, credenciales PostgreSQL, Redis, SMTP, Meta ni secretos OSE en variables `VITE_*`.

## C. Dominio HTTPS

1. En Pages > Custom domains, agregar `pos.tudominio.pe`.
2. Seguir la validación DNS que muestra Cloudflare y esperar a que el certificado TLS esté activo.
3. No compartir ni usar la URL definitiva hasta que HTTPS esté activo y las pruebas de API pasen.

## D. Pruebas obligatorias desde Android

Abrir Chrome en Android y visitar la URL HTTPS. Comprobar:

1. `/login` carga y no aparece la página de error de `index.html` abierto como archivo local.
2. Actualizar directamente una ruta interna (por ejemplo `/productos`) no devuelve 404.
3. `https://pos.tudominio.pe/api/health` responde a través del proxy. Si `API_ORIGIN` no está configurado, 503 es esperado; si el backend no responde, 502 es esperado.
4. Iniciar sesión y comprobar que se mantiene al navegar y actualizar.
5. Probar permisos por rol, lectura y escritura de productos, una venta de prueba, caja y reportes en una base de staging.
6. Revisar DevTools/Logs: ninguna petición de la app debe dirigirse a `localhost`; ningún secreto debe aparecer en el JS descargado.
7. Probar cámara/lector de código de barras bajo HTTPS y los tamaños de pantalla Android.

## E. Worker de alertas (opcional, después de validar API)

El Worker de `cloudflare/alertas-cron/` requiere que el backend esté público por HTTPS y que la migración de alertas persistentes esté aplicada en una base de staging. Configurar `POS_API_ORIGIN` y `CRON_SECRET` como secretos/variables del Worker; el secreto debe coincidir con el backend. Desplegar con Wrangler desde esa carpeta. No desplegarlo antes de verificar el endpoint interno y la migración correspondiente.

## Límites de esta versión

- Cloudflare Pages aloja frontend y proxy; no ejecuta el backend NestJS ni Redis.
- La API actual usa PostgreSQL/TypeORM y Bull/Redis; no es un Worker nativo.
- La integración SUNAT/OSE sigue simulada.
- La configuración de dominio, variables, túnel, backend, Redis y Supabase requiere acceso a las cuentas del propietario. Esta guía no ejecuta cambios remotos.
- No ejecutar migraciones en producción como parte de esta guía.
