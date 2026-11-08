# Migración Supabase + Cloudflare sin VPS — v1.44.0

## Objetivo
Retirar progresivamente NestJS/TypeORM/Redis y operar con Cloudflare Pages/Functions/Workers + Supabase Auth/PostgreSQL/Storage. Esta entrega es una base de migración; **no declara que los módulos de negocio ya hayan sido migrados**.

## Estado de los pasos 1–5

| Paso | Trabajo de esta entrega | Estado real |
|---|---|---|
| 1. Auth y permisos | Endpoint Cloudflare `/api/edge/auth/me` valida access token contra Supabase Auth. Preview SQL para vincular `usuario.supabase_auth_user_id`. | Base implementada; frontend sigue usando login NestJS hasta completar el vínculo de identidades, refresh, logout y pruebas RLS. |
| 2. Catálogos | Contrato RPC seguro `/api/edge/rpc/:name` con allowlist y JWT del usuario. | Infraestructura lista; productos, categorías, clientes y sucursales aún usan endpoints antiguos. |
| 3. Operaciones transaccionales | Definición del patrón RPC autenticado e idempotente, sin permitir RPC arbitrarias. | Pendiente implementar y probar funciones SQL para ventas, pagos, caja y stock. No activar en producción. |
| 4. Módulos | Se conserva compatibilidad y se devuelve 501 explícito en rutas Edge no migradas. | No migrado integralmente; no se redirigen operaciones críticas a endpoints incompletos. |
| 5. Jobs | Worker independiente con handlers Queue y Cron, allowlists y secretos exclusivamente server-side. | Esqueleto implementado; requiere funciones SQL aprobadas, colas y secrets configurados en Cloudflare. |

## Arquitectura objetivo
- Cloudflare Pages: frontend React/Vite.
- Pages Functions: API Edge versionada y validación de sesión.
- Cloudflare Worker: tareas asíncronas y Cron.
- Supabase Auth: identidad y sesiones.
- Supabase PostgreSQL: persistencia, RLS y RPC transaccionales.
- Supabase Storage: XML, CDR, PDF y archivos, con buckets privados y URLs firmadas.
- Cloudflare Queues: trabajos asíncronos; sin Redis/Bull.

## Rutas añadidas
- `GET /api/edge/health`
- `GET /api/edge/auth/me` — requiere `Authorization: Bearer <supabase_access_token>`.
- `POST /api/edge/rpc/<nombre>` — requiere token y nombre incluido en `SUPABASE_RPC_ALLOWLIST`.
- Otras rutas `/api/edge/*` responden 501 hasta que el módulo esté migrado.

Las rutas existentes `/api/*` siguen con el proxy NestJS antiguo. Por tanto, no se debe quitar `API_ORIGIN` ni apagar NestJS todavía. Esta versión evita un corte de servicio durante la migración.

## Variables de Pages Functions
- `SUPABASE_URL` (por ejemplo `https://<project-ref>.supabase.co`).
- `SUPABASE_ANON_KEY` (clave pública/anon; nunca service_role).
- `SUPABASE_RPC_ALLOWLIST` (vacía por defecto; agregar solo RPC auditadas).
- `API_ORIGIN` sigue siendo necesario para rutas antiguas hasta migrarlas.

## Secrets del Worker de Jobs
Configurar con `wrangler secret put`, no en archivos:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (solo Worker de confianza; nunca frontend ni Pages public env)
- `PRIVILEGED_RPC_ALLOWLIST`
- `CRON_RPC_ALLOWLIST`
- `QUEUE_RPC_ALLOWLIST`

La service role omite RLS. Solo debe invocar funciones SQL pequeñas, explícitas, auditadas y con validación de argumentos. No agregar funciones a allowlists hasta revisar su SQL y permisos.

## Orden de migración funcional pendiente
1. Crear/invitar usuarios Auth y vincular UUID a `usuario` mediante procedimiento administrativo verificado; nunca por coincidencia de username/email.
2. Migrar lectura/escritura de empresas, sucursales, usuarios, categorías, productos y clientes; definir políticas RLS tabla por tabla.
3. Implementar RPC transaccionales idempotentes para venta, pagos, movimiento de caja y descuento de inventario. Deben bloquear stock concurrente, validar empresa/sucursal, calcular importes en servidor y registrar claves idempotentes.
4. Migrar compras, devoluciones, anulaciones, conteos, mermas, cuentas, reportes y alertas; probar regresión contra API actual.
5. Migrar FE, notificaciones y tareas programadas a Queue/Cron/Storage; implementar outbox transaccional, reintentos, DLQ y observabilidad.

## Condiciones para retirar NestJS/Redis
No retirar `API_ORIGIN`, NestJS, TypeORM ni Redis hasta que todas las rutas del frontend tengan reemplazo, todas las operaciones monetarias sean transaccionales, las pruebas de acceso cruzado pasen y exista plan de reversión probado.

## No realizado
- No se ejecutó SQL ni migración.
- No se cambió el proyecto remoto Supabase.
- No se creó ni desplegó Worker, Queue o Pages.
- No se publicaron secretos ni se modificó el frontend para cambiar el login activo.
- No se declara que el POS opere ya sin VPS: eso será cierto solo al completar y desplegar la migración de los módulos pendientes.
