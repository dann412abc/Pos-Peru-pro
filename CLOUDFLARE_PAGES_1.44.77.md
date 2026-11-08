# Controla Ventas 1.44.77 — despliegue Cloudflare Pages sin VPS

## Qué entrega esta versión

- Frontend React/Vite listo para compilar y publicar en Cloudflare Pages.
- Pages Functions bajo `frontend/functions/`, incluyendo `/api/health` y `/api/edge/*`.
- Supabase se conecta desde Pages Functions con `SUPABASE_URL` y `SUPABASE_ANON_KEY` como variables de entorno del servidor.
- No necesita VPS para publicar la interfaz y las rutas Edge ya migradas.
- El backend NestJS/Redis se conserva en el ZIP por compatibilidad histórica, pero **no forma parte del despliegue Cloudflare Pages**.

## Crear el proyecto en Cloudflare Pages

En Cloudflare Dashboard:

1. Workers & Pages → Create → Pages → Connect to Git.
2. Selecciona el repositorio que contiene esta versión.
3. Configura:
   - Framework preset: `Vite`
   - Root directory: `frontend`
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
4. No configures `API_ORIGIN` ni `POS_API_ORIGIN`. Esas variables reactivan el backend heredado y contradicen el despliegue sin VPS.
5. Guarda y ejecuta el primer deployment.

Si se publica manualmente desde una carpeta local, primero ejecuta los comandos de compilación descritos abajo y luego carga `frontend/dist` como sitio estático. Para habilitar Pages Functions, despliega desde Git conectado o Wrangler Pages manteniendo `frontend/functions` dentro del proyecto; subir solamente `dist` publica la interfaz estática pero **no** publica las funciones.

## Variables de compilación

Configurar en Pages → Settings → Environment variables → Build:

| Variable | Preview para pruebas | Production |
|---|---|---|
| `VITE_API_URL` | `/api` | `/api` |
| `VITE_DEMO_MODE` | `true` | `false` |
| `VITE_AUTH_PROVIDER` | `legacy` | `legacy` hasta terminar el enlace de identidad Supabase |
| `VITE_SUPABASE_SALES_ENABLED` | `false` | `false` |

El modo demo permite recorrer la interfaz y probar datos locales de demostración. No representa ventas reales, no sincroniza con Supabase y no debe habilitarse en producción.

## Variables runtime de Pages Functions

Configurar en Settings → Variables and Secrets, separadas para Preview y Production:

- `SUPABASE_URL`: URL HTTPS del proyecto Supabase.
- `SUPABASE_ANON_KEY`: clave publicable/anon del proyecto.

No configurar `SUPABASE_SERVICE_ROLE_KEY` en Pages. No añadir claves `VITE_` para secretos. Mantener `SUPABASE_RPC_ALLOWLIST` vacía hasta aprobar cada RPC concreta. No exponer la clave service-role.

## Verificación después del despliegue

Abrir:

- `https://<tu-proyecto>.pages.dev/` — interfaz.
- `https://<tu-proyecto>.pages.dev/api/health` — debe devolver `ok: true`, `deployment: cloudflare-pages`, `version: 1.44.77`.
- `https://<tu-proyecto>.pages.dev/api/edge/health` — debe devolver `ok: true`; `supabaseConfigured` será `true` si las dos variables runtime están configuradas.

## Prueba de interfaz en Preview

Con `VITE_DEMO_MODE=true` en el entorno Preview, iniciar sesión con:

- Usuario: `admin`
- Contraseña: `123456`

o

- Usuario: `cajero`
- Contraseña: `123456`

Los datos demo se guardan localmente en el navegador (IndexedDB/localStorage). No son datos comerciales ni se envían a Supabase. No reutilizar estas credenciales en Production.

## Estado funcional y limitaciones que no deben ocultarse

Esta versión se puede publicar en Cloudflare Pages sin VPS y permite probar la interfaz en Preview. **No es todavía un POS de producción completamente migrado**:

- `VITE_AUTH_PROVIDER` permanece en `legacy` porque la función de perfil `pos_mi_perfil_auth` y el contrato de identidad no han sido verificados/instalados en el Supabase actual.
- El registro transaccional de ventas no está habilitado en Supabase.
- Algunas operaciones de caja, devoluciones, crédito/cobranzas, inventario, reportes y administración siguen dependiendo de módulos heredados o RPC pendientes.
- Las rutas Edge que no están migradas responden `501 EDGE_ROUTE_NOT_MIGRATED` o un estado explícito de migración requerida. No inventan escrituras exitosas.
- No activar facturación electrónica SUNAT/OSE hasta integrar y certificar el proveedor correspondiente.

Antes de pasar el proyecto a Production con usuarios reales, cerrar las brechas de `AUDITORIA_NO_VPS_1.44.76.md`, instalar y probar migraciones en un entorno Supabase de staging y cambiar autenticación solo después de validar RLS, identidad y RPC.

## Desarrollo y compilación local

Requiere Node.js LTS y npm:

```bash
cd frontend
npm ci
npm run build
```

El resultado está en `frontend/dist`. Para probar localmente con Pages Functions, usar Wrangler Pages desde el proyecto frontend una vez instaladas las dependencias de desarrollo de Wrangler; no abrir `index.html` mediante `file://`, porque React/Vite requiere un servidor HTTP.
