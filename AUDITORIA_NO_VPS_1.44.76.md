# Auditoría de arquitectura sin VPS — Mi Carrito POS 1.44.76

Fecha de revisión: 2026-11-08  
Paquete inspeccionado: `mi-carrito-pos-v1.44.76-auditoria-caja.zip`

## Dictamen

La versión avanzada debe quedar operativa sin VPS. La arquitectura objetivo es:

- **Cloudflare Pages**: aplicación React/Vite y publicación HTTPS.
- **Cloudflare Pages Functions / Workers**: API serverless, validación de payloads, integración con Supabase y tareas programadas.
- **Supabase Auth + PostgreSQL**: identidad, datos y transacciones de negocio.
- **Cloudflare Queues/Workers Cron o mecanismos programados de Supabase**: tareas asíncronas, reintentos y alertas, siempre con operaciones idempotentes.

No deben ser requisitos de producción: VPS, servidor NestJS persistente, PostgreSQL autogestionado, Redis ni Bull.

**Estado de la versión auditada: migración parcial, no apta todavía para producción estrictamente sin VPS.** No se debe publicar como versión final completa hasta cerrar las brechas que se enumeran abajo.

## Evidencia de dependencia heredada

1. `frontend/functions/api/[[path]].js` reenvía `/api/*` a `API_ORIGIN`. Si no se configura, devuelve `503`; si se configura, vuelve a exigir un backend persistente.
2. `frontend/.env.example` conserva `VITE_AUTH_PROVIDER=legacy` y comenta que ventas y otros módulos siguen usando NestJS.
3. `frontend/src/api/client.ts` usa `/api` en producción; varias pantallas llaman endpoints REST antiguos a través de ese cliente.
4. `cloudflare/alertas-cron` llama `/api/internal/cron/alertas` en un servidor externo y exige `POS_API_ORIGIN` y `CRON_SECRET`.
5. `backend/` contiene NestJS, TypeORM y Bull/Redis. Se conserva como referencia/compatibilidad local, no como backend de la arquitectura final sin VPS.

## Funcionalidades con ruta Edge/Supabase ya presente

La existencia de la ruta y sus pruebas de contrato no demuestra que las migraciones preview estén instaladas en el proyecto Supabase real. La inspección directa del proyecto Supabase activo confirmó que varias RPC nuevas esperadas por esas rutas todavía no están instaladas. Las rutas que se encontraron en el código incluyen:

- Supabase Auth: login, refresh, logout, recuperación, sesión y perfil POS.
- Lectura y mutación de catálogo, variantes y clientes/proveedores.
- Compras: lectura, recepción, pagos, devoluciones a proveedor, anulación y órdenes de compra.
- Caja: resumen, apertura, movimiento, cierre e historial.
- Inventario: consulta de vencimientos y reposición.
- Devoluciones de venta: listado, búsqueda, disponibilidad y prevalidación (no el registro final).
- Ventas: preparación/idempotencia y lectura de detalle, pero el registro definitivo no está habilitado mientras falte la RPC transaccional validada.

## Brechas críticas antes de declarar una versión final sin VPS

| Área | Estado observado | Cierre requerido |
|---|---|---|
| Autenticación | Flujo Supabase implementado, proveedor sigue en `legacy` por defecto | Vincular usuarios reales, validar RLS y probar login/refresh/logout en staging |
| Venta rápida | Catálogo y consulta de idempotencia presentes; test indica que el cobro sigue bloqueado | RPC atómica final: comprobante, correlativo, pagos, inventario, caja/cuenta por cobrar e idempotencia; pruebas de concurrencia |
| Devoluciones de venta | Consulta y prevalidación disponibles; no hay commit Supabase | RPC atómica de devolución, reposición de stock, reembolso y asiento de caja; validar esquema real primero |
| Crédito y cobranzas | Varias pantallas continúan con `api.*` heredado | Migrar cartera, abonos, reversos, límites, estados y conciliación a RPC autenticadas |
| Productos e inventario | Lecturas parciales vía Supabase; CRUD/ajustes/transferencias y otros flujos aún usan API antigua | Completar CRUD, stock por sucursal/variante, ajustes, transferencias, mermas y conteo físico |
| Reportes y dashboard | Consultas REST heredadas | Crear vistas/RPC de lectura seguras, agregaciones por empresa/sucursal y pruebas de consistencia |
| Administración | Usuarios, roles, sucursales y configuración aún dependen del backend legado | Migrar administración con autorización administrativa validada en SQL |
| Alertas y tareas | Worker de alertas actual llama NestJS; Worker genérico de jobs está preparado, no terminado | Mover alertas y tareas a Workers/Queues o Supabase; reintentos, DLQ y logs sin datos sensibles |
| Facturación electrónica | OSE es MOCK y la cola está en Bull | Integrar proveedor OSE/PSE real, firma/certificado, UBL, CDR, baja/resumen y cola serverless; validar SUNAT |
| Notificaciones | Email/WhatsApp y configuración siguen ligados al backend | Migrar secretos a Workers y tareas asíncronas; probar entregas y reintentos |
| Offline | Dexie y cola local existen; la sincronización actual incluye endpoints NestJS | Definir y probar sincronización idempotente contra Edge/Supabase para cada operación admitida |


## Validación de Supabase real — solo lectura

Se conectó al proyecto Supabase **POS AYNI PERÚ** (PostgreSQL 17.11) y se ejecutaron consultas de catálogo/funciones/políticas en modo de solo lectura. No se insertaron, actualizaron ni borraron datos; no se alteró esquema, permisos, Auth ni historial de migraciones.

Hallazgos confirmados el 2026-11-08:

1. **Dos generaciones de tablas coexisten**: singular (`empresa`, `usuario`, `producto`, `caja`, `comprobante`, `cuenta_cobrar`, `devolucion_venta`, etc.) y plural (`empresas`, `usuarios`, `productos`, `clientes`, `ventas`, `venta_items`, etc.). Caja, cobranzas y devoluciones usan la generación singular y claves enteras `integer`/`bigint`. No se deben mezclar sus identificadores con los de la generación plural.
2. **La historia de migraciones remota solo devuelve dos registros** (`migration_7_9_restrict_return_table_privileges` y `migration_8_0_deterministic_return_line_locks`). Por ello, los archivos de `migrations-preview` del ZIP no se pueden considerar aplicados solo porque existan en el repositorio. Es posible que se aplicaran scripts desde SQL Editor sin dejar historial, pero eso no se debe asumir: se compara por función/DDL real antes de cualquier cambio.
3. **Las RPC existentes** incluyen `pos_abrir_caja`, `pos_estado_caja`, `pos_registrar_movimiento_caja`, `pos_resumen_caja`, `pos_cerrar_caja`, `pos_registrar_cobranza` y `pos_registrar_devolucion`. Las cinco funciones inspeccionadas de caja/crédito/devolución son `SECURITY DEFINER`, fijan `search_path` a `public, pg_temp` y solo conceden `EXECUTE` a `authenticated` (no a `anon` ni `PUBLIC`). Sus cuerpos verifican el usuario/empresa/rol y la sucursal usando `mi_usuario_id()`, `mi_empresa_id()`, `mi_rol()` y `mi_puede_ver_sucursal()`. Cobranza usa bloqueo asesor (`pg_advisory_xact_lock`) e idempotencia; caja bloquea filas con `FOR UPDATE`; devolución valida líneas, cantidades, reembolso/abono y reposición de inventario. Esto es evidencia del código SQL instalado, no una prueba transaccional de extremo a extremo con usuario real.
4. **Desfase de contrato confirmado**: las rutas Pages Functions para el ciclo moderno de caja solicitan `pos_caja_abrir_auth`, `pos_caja_movimiento_auth`, `pos_caja_cerrar_auth`, `pos_caja_resumen_auth` y `pos_caja_movimientos_listar_auth`; las rutas de devolución también solicitan funciones con sufijo `_auth`. Esas funciones no aparecen en el catálogo remoto consultado. La base sí tiene las RPC anteriores sin ese sufijo. Hasta alinear los contratos, esas rutas modernas no deben habilitarse como si estuvieran operativas.
5. **RLS está habilitado** en las nueve tablas examinadas de caja/cobros/devoluciones; se encontraron políticas `SELECT` de empresa/sucursal. `public.usuario` tiene RLS habilitado pero sin políticas, lo cual bloquea el acceso directo por API y puede ser intencional si la identidad se resuelve mediante RPC privilegiadas; requiere validar el flujo de perfil antes de habilitar lecturas directas.
6. El asesor de seguridad de Supabase muestra **23 funciones `SECURITY DEFINER` ejecutables por `authenticated`**, además de una advertencia por protección contra contraseñas filtradas deshabilitada. No se deben revocar en bloque: las RPC de negocio requieren ejecución autenticada y realizan comprobaciones internas, pero cada función restante debe ser revisada una por una para comprobar autorización, `search_path` fijo y alcance de datos.
7. El asesor de rendimiento señala políticas permisivas SELECT duplicadas en `compra_linea` y `usuario_sucursal`, además de índices aún no utilizados. No se eliminan índices por esa métrica sin carga de uso representativa: el proyecto es reciente y una eliminación prematura puede empeorar consultas futuras.

**Resultado:** la base real contiene lógica útil de caja, cobros y devoluciones, pero aún no coincide con todos los contratos RPC que espera la capa serverless nueva. La migración sin VPS sigue incompleta.

## Correcciones y limpieza realizadas en esta auditoría

- Se unificó la versión declarada en `VERSION`, `frontend/package.json`, `frontend/package-lock.json`, `backend/package.json` y `backend/package-lock.json` a `1.44.76`.
- Se corrigió el JSON del manifiesto del backend, que anteriormente terminaba con caracteres literales `\\n` y no podía ser parseado correctamente.
- Se actualizó este README para distinguir la arquitectura objetivo de la dependencia heredada que todavía existe.
- No se eliminaron archivos del ZIP fuente original: se preservaron los 603 archivos que contenía. Se limpió del área de trabajo el `frontend/node_modules` parcial creado durante el intento de instalación y no se incluyó en el paquete final. Se añadieron cuatro archivos nuevos de auditoría/entrega.
- No se eliminaron migraciones SQL, pruebas ni documentos históricos: forman parte de la trazabilidad de la base de datos y no son basura segura para borrar.
- Se corrigió un error de sintaxis en el diagnóstico SQL (lectura de `search_path`) después de que la ejecución real lo detectara. La versión corregida se ejecutó correctamente en Supabase en modo de solo lectura; no se modificó ninguna tabla, dato, función, política, permiso ni migración.

## Pruebas ejecutadas en esta revisión

| Suite | Resultado |
|---|---:|
| `supabase/migrations-preview/*.test.mjs` + `supabase/tests/*.test.mjs` | 156 aprobadas, 0 fallidas, 2 omitidas (staging requiere autorización y fixture) |
| `frontend/functions/api/**/*.test.mjs` | 66 aprobadas, 0 fallidas |
| `frontend/functions/api/proxy.test.js` | 3 aprobadas, 0 fallidas |
| **Total Node test ejecutado** | **225 aprobadas, 0 fallidas, 2 omitidas** |

No se pudo ejecutar la prueba de `edge.test.js` porque requiere Vitest y el entorno no tiene las dependencias de frontend instaladas. Tampoco se completaron `npm ci`, `tsc`, `vite build`, Jest ni Vitest: la instalación de dependencias quedó incompleta. Las pruebas estáticas no sustituyen pruebas reales de staging.

## Bloqueos externos para terminar el cierre

1. Crear/usar un entorno Supabase de staging aislado, con datos sintéticos y usuarios de prueba; no usar producción para pruebas destructivas o de concurrencia.
2. Unificar el contrato RPC de caja y devoluciones: adaptar Pages Functions a las RPC instaladas o diseñar migraciones nuevas compatibles, con revisión de autorización, RLS e idempotencia.
3. Auditar individualmente las 23 funciones `SECURITY DEFINER`, revisar `public.usuario` sin políticas y activar la protección de contraseñas filtradas desde Auth cuando sea compatible con el proceso de acceso.
4. Resolver las políticas permisivas duplicadas en `compra_linea` y `usuario_sucursal` solo tras confirmar la intención funcional.
5. Migrar los módulos aún dependientes de NestJS/Redis (ventas transaccionales, crédito, inventario completo, reportes, administración, alertas y notificaciones).
6. Completar `npm ci`, compilaciones Vite/Nest/Vitest y pruebas de integración desde un entorno con acceso a npm; el entorno de esta auditoría no pudo resolver el registro npm.
7. Desplegar Cloudflare Pages/Workers con `API_ORIGIN` y `POS_API_ORIGIN` ausentes y probar PC/Android, autenticación, caja, ventas, devoluciones y recuperación de errores.

**Regla de liberación:** mientras existan pantallas que necesiten `API_ORIGIN`, no se debe declarar que el POS completo funciona sin VPS. El criterio de aceptación es que todos los módulos de uso diario funcionen con `API_ORIGIN` y `POS_API_ORIGIN` ausentes y que los tests de integración confirmen las transacciones en Supabase.
