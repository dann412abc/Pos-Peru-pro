# Beta visual 1.44.79 — Cloudflare Pages Preview

## Propósito y límites

Esta publicación es una **beta visual/de demostración**, destinada a revisar navegación, presentación y adaptación a PC y Android. No está autorizada para registrar ventas, compras, cobros, devoluciones ni movimientos reales.

- Rama: `work/returns-register-1.44.79`
- Versión frontend: `1.44.79`
- Backend objetivo: Cloudflare Pages Functions; no requiere VPS.
- Supabase: no conectar en esta beta visual.
- No aplicar migraciones SQL ni habilitar RPC en producción.

## Configuración del entorno Preview

En Cloudflare Dashboard → Workers & Pages → proyecto → Settings → Environment variables, configura **solo para Preview**:

| Variable de build | Valor |
|---|---|
| `VITE_API_URL` | `/api` |
| `VITE_DEMO_MODE` | `true` |
| `VITE_AUTH_PROVIDER` | `legacy` |
| `VITE_SUPABASE_SALES_ENABLED` | `false` |

No copies estos valores a Production. No agregues `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `API_ORIGIN` ni `POS_API_ORIGIN` a esta beta visual. No habilites RPC.

## Publicación desde Git

1. Conecta el repositorio `dann412abc/Pos-Peru-pro` a Cloudflare Pages si todavía no está conectado.
2. Root directory: `frontend`.
3. Build command: `npm ci && npm run build`.
4. Build output directory: `dist`.
5. Selecciona la rama `work/returns-register-1.44.79` para el Preview deployment.
6. Confirma que las cuatro variables anteriores estén asignadas al entorno Preview y que `VITE_DEMO_MODE` no esté habilitado en Production.
7. Espera a que Cloudflare termine el build y abra la URL de Preview de esa rama.

Las variables `VITE_*` se incorporan durante la compilación: si las modificas, vuelve a desplegar Preview.

## Verificación visual

- Abre la URL Preview en PC y Android.
- Comprueba inicio de sesión de demostración, menú, productos, navegación y diseño adaptable.
- Credenciales demo documentadas: `admin / 123456` o `cajero / 123456`. Solo para datos locales de demostración.
- `/api/health` debe devolver `ok: true`, `deployment: cloudflare-pages` y `version: 1.44.79`.
- `supabaseConfigured: false` es esperado en esta beta visual.
- No introduzcas datos personales ni comerciales reales. No uses esta beta para operaciones de caja.

## Criterio para pasar a beta funcional

No promover a Production ni conectar Supabase hasta:
1. Tener respaldo verificable y plan de restauración de la base.
2. Revisar y adaptar las migraciones preview al esquema real.
3. Instalar primero en un proyecto Supabase de staging separado.
4. Validar identidad, RLS, RPC y permisos con usuarios de prueba.
5. Ejecutar pruebas transaccionales reales de compra → lote → venta FEFO → caja → devolución → inventario en staging.
6. Confirmar compilación y pruebas de integración sin fallos.
7. Aprobar explícitamente el cambio de entorno y las operaciones permitidas.

**Estado:** beta visual preparada para publicación en Preview; todavía no es una beta funcional conectada a datos reales ni una versión apta para producción comercial.
