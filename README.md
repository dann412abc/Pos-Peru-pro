# Mi Carrito POS v1.44.76 — Sistema POS para Perú

> **Tu punto de venta, siempre contigo.**
>
> Proyecto POS para el mercado peruano (fase de estabilización; integración SUNAT todavía simulada). Sistema comercial con soporte de inventario y operación por sucursal: IGV 18%, moneda S/ (PEN), comprobantes 01/03/07/08, UBL 2.1, OSE configurable, colas de envío, caja, y modo offline en el POS.
>
> *Nota de marca:* este proyecto se denominaba originalmente "AYNI POS". El nombre de marca fue cambiado a **Mi Carrito POS**; el dominio SUNAT/IGV, los datos demo del emisor y el stack se mantienen inalterados.

> **Decisión de arquitectura para la versión avanzada:** la entrega final debe operar **sin VPS y sin un backend Node/Redis persistente**. La arquitectura objetivo es Cloudflare Pages + Pages Functions/Workers para la capa de ejecución y Supabase Auth + PostgreSQL para identidad y datos. La migración todavía es parcial en v1.44.76: varias pantallas siguen usando endpoints NestJS y el cobro final de ventas y el commit de devoluciones aún no están habilitados en el flujo Supabase. Por eso, este ZIP es una versión de auditoría/migración, **no una liberación final lista para producción sin VPS**. Consulta [AUDITORIA_NO_VPS_1.44.76.md](AUDITORIA_NO_VPS_1.44.76.md) y [DEPLOY_NO_VPS_CLOUDFLARE_SUPABASE.md](DEPLOY_NO_VPS_CLOUDFLARE_SUPABASE.md).

---

## 1. Arquitectura del scaffold

```
mi-carrito-pos/
├── backend/        # NestJS 10 + TypeScript + TypeORM + PostgreSQL 15 + Redis 7 (Bull)
├── frontend/       # React 18 + TypeScript + Vite + Tailwind CSS + Dexie.js (offline-first)
├── README.md       # este archivo
└── API.md          # documentación de endpoints principales
```

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Frontend POS | React 18 + Vite + Tailwind + Dexie (IndexedDB) | Venta rápida, CRUDs, ticket imprimible (58/80/A5), offline-first, encolado de ventas pendientes |
| API REST | NestJS 10 + TypeScript | Autenticación JWT, RBAC por sucursal, ventas, caja, FE, notificaciones |
| Base de datos | PostgreSQL 15 | Datos transaccionales (empresas, sucursales, productos, ventas, caja, FE event-sourcing) |
| Colas | Redis 7 + Bull | Envío de comprobantes electrónicos, reintentos con backoff, envío automático de notificaciones |
| OSE | Adaptador configurable (mock Nubefact sandbox) | Firma y envío de XML UBL 2.1 a SUNAT; CDR |

**ORM elegido: TypeORM** — integración nativa con NestJS (`@nestjs/typeorm`), sin paso de generación de código (el build funciona offline), control explícito de transacciones para el correlativo atómico y descuento de stock, y `SnakeNamingStrategy` propia que convierte camelCase (TypeScript) → snake_case (columnas PostgreSQL) de forma uniforme.

---

## 2. Arquitectura y despliegue (objetivo sin VPS)

La arquitectura final prevista utiliza **Cloudflare Pages + Pages Functions/Workers** y **Supabase Auth + PostgreSQL**. No debe requerir VPS, servidor Node persistente, PostgreSQL autogestionado ni Redis/Bull. Las tareas programadas y asíncronas deben migrarse a Workers/Queues o a funciones programadas compatibles con Supabase, con RPC transaccionales e idempotentes.

**Estado real de v1.44.76:** la migración es parcial. `frontend/functions/api/edge/[[path]].js` ya resuelve varias rutas con sesión Supabase, pero `frontend/functions/api/[[path]].js` sigue siendo un proxy legado opcional a NestJS. Además, varias pantallas aún llaman endpoints NestJS; sin `API_ORIGIN` esas funciones no están disponibles. El Worker `cloudflare/alertas-cron` también conserva dependencia del backend antiguo. No configures esos orígenes para una instalación estrictamente sin VPS. La lista de brechas y criterios de cierre está en [AUDITORIA_NO_VPS_1.44.76.md](AUDITORIA_NO_VPS_1.44.76.md).

El directorio `backend/` se conserva como implementación heredada y referencia de reglas de negocio durante la migración. No forma parte del runtime de producción objetivo sin VPS y no debe interpretarse como servicio serverless.

### Desarrollo local

Requiere Node.js compatible con el proyecto, PostgreSQL de desarrollo y Redis. Usa una base de datos separada de producción y nunca ejecutes migraciones de prueba contra tu proyecto Supabase real.

```bash
cd backend
cp .env.example .env
npm ci
npm run start:dev

# En otra terminal
cd frontend
cp .env.example .env
npm ci
npm run dev
```

### Producción

Para el frontend en Pages, sigue [CLOUDFLARE_PAGES.md](CLOUDFLARE_PAGES.md). Para el backend actual en un runtime Node conectado a Supabase, consulta [SUPABASE_DEPLOY.md](SUPABASE_DEPLOY.md). Cloudflare Tunnel puede publicar el backend con HTTPS.

**No ejecutes `migration:run` ni `seed` hasta completar respaldo y validación en staging.** El `seed` contiene usuarios y datos de demostración y no debe ejecutarse en producción.

### Usuarios demo (solo entorno local)

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `123456` | ADMIN |
| `cajero` | `123456` | CAJERO |

Estos usuarios son exclusivamente para desarrollo local. Cambia o elimina las credenciales demo antes de cualquier despliegue.

## 3. Variables de entorno (resumen)

**backend/.env.example**: `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE/DB_SSL`, `REDIS_HOST/REDIS_PORT`, `JWT_ACCESS_SECRET/JWT_REFRESH_SECRET`, `OSE_MOCK=true`, `CRON_SECRET`, `SMTP_HOST/PORT/USER/PASS/FROM`, `WHATSAPP_PHONE_NUMBER_ID/ACCESS_TOKEN/API_VERSION`, `ENVIO_AUTOMATICO_EMAIL` y `ENVIO_AUTOMATICO_WHATSAPP`.

**frontend/.env.example**: `VITE_API_URL` (http://localhost:3000/api), `VITE_COMPROBANTE_URL_BASE` (link de descarga de comprobantes para WhatsApp/email).

---

## 4. Dominio implementado (reflejo del manual)

- **Productos e inventario**: precio incluye IGV, `tipo_igv` enum 10=gravado / 20=exonerado / 30=inafecto, precio_mayoreo, saldos independientes por sucursal (`producto_stock`), stock mínimo y unidad (NIU). Incluye ajustes auditados y transferencias entre sucursales autorizadas.
- **Motor IGV** (puro y testeado): `base = precio / 1.18`, `igv = base * 0.18`; exonerado/inafecto no suman IGV; descuento por línea antes de IGV; redondeo a 2 decimales.
- **Clientes**: DNI (8 dígitos) / RUC (11 dígitos, prefijo permitido y dígito verificador módulo 11), email, teléfono, límite/saldo de crédito.
- **Ventas/comprobantes**: tipo 01 factura / 03 boleta / 07 nota crédito / 08 nota débito; serie+correlativo **atómico por sucursal** (transacción con `UPDATE...RETURNING`); métodos de pago EFECTIVO/TARJETA/YAPE/PLIN/CREDITO; vuelto en efectivo; descuento de stock.
- **Caja**: apertura con saldo inicial, cierre con arqueo por método y diferencia, movimientos de ingreso/egreso y una sola caja abierta por sucursal+usuario (unique parcial).
- **Facturación electrónica**: generador XML UBL 2.1 (catálogos SUNAT: tipo doc 01/03, tipo IGV 10/20/30, moneda PEN, unidad NIU, país PE), adaptador OSE con interfaz + mock sandbox de Nubefact (endpoint configurable, **no llama APIs reales**), event-sourcing de estados (CREADO→FIRMADO→ENVIADO→ACEPTADO/RECHAZADO) con CDR y observaciones, cola Bull con backoff exponencial (máx 5 intentos) + circuit breaker básico, esqueletos de Resumen Diario (RC) y Comunicación de Baja (RA).
- **PDF representante**: interfaz `GeneradorPdfInterface` + stub, endpoint `GET /api/fe/comprobantes/:id/pdf?formato=58mm|80mm|A5` (default 80mm).
- **Notificaciones**: email (Nodemailer/SMTP) y WhatsApp Business Cloud API (Graph v26.0 por defecto y plantilla aprobada configurable), con estado de credenciales y pruebas desde Configuración. El historial identifica los envíos simulados. Los comprobantes aceptados por el adaptador OSE MOCK no disparan comunicaciones automáticas a clientes.
- **Auth**: login propio con bcrypt y JWT access+refresh, Passport, guards, roles ADMIN/CAJERO y RBAC por sucursal. `supabase_auth_user_id` es solo un vínculo opcional; el login todavía no valida sesiones de Supabase Auth. Swagger/OpenAPI en `/api/docs`.

**Frontend**: login, layout con roles y sucursal, venta rápida, carrito, IGV, pagos, ticket, productos, clientes, historial, facturación, caja, compras, devoluciones, gastos, inventario por lotes, mermas, conteo físico, alertas, reportes y Configuración. La administración permite crear usuarios, asignar sucursales, cambiar roles, activar/desactivar y restablecer contraseñas. Offline-first con Dexie y colas locales para operaciones compatibles.

---

## 5. Verificación histórica de la entrega base (v1.43.1)

| Verificación | Resultado de esta revisión |
|---|---|
| Análisis sintáctico TypeScript/TSX | **230 archivos** analizados sin diagnósticos de sintaxis |
| Lógica del generador de alertas | Se añadieron pruebas unitarias; Jest no pudo ejecutarse porque no se completó la instalación de dependencias |
| `npm ci` y compilación integral | No completados: el registro npm no respondió dentro del tiempo disponible |
| PostgreSQL/Supabase y migraciones | No ejecutados contra una base real. Las migraciones no crean RLS; el aislamiento actual depende del backend |
| Cloudflare Pages/Worker | Configuración y código incluidos; no desplegados ni ejecutados en una cuenta real |
| SUNAT/OSE | Adaptador MOCK explícito; no hay integración tributaria real |

El análisis sintáctico no equivale a chequeo de tipos, compilación, tests completos ni aceptación de negocio. Las migraciones `1710000000020`–`1710000000023` permanecen pendientes de validar en staging. No existe archivo `1710000000019`; revisar el historial de la base antes de migrar. Consulta `AUDITORIA_CORRECCIONES_1.43.1.md`. No se ha modificado la base Supabase ni se ha desplegado Cloudflare.

## 6. Cierre y requisitos antes de producción

1. Instalar dependencias desde `registry.npmjs.org` y ejecutar `npm run build` y `npm test` en backend y frontend.
2. Probar todas las migraciones en una copia de staging y comprobar RLS/aislamiento por empresa y sucursal antes de aplicar a producción.
3. Completar la migración de todos los endpoints y procesos de NestJS/Redis a Cloudflare Workers/Queues y Supabase; el objetivo final no permite depender de VPS. No configurar `API_ORIGIN` ni `POS_API_ORIGIN` en el despliegue sin VPS.
4. Conectar y homologar proveedor OSE/PSE real, certificado de firma y credenciales SUNAT. Este ZIP no está habilitado para emitir comprobantes tributarios reales.
5. Ejecutar pruebas de integración en staging de ventas, devoluciones, caja, compras, inventario, permisos y dispositivos PC/Android con datos de prueba.

---

*Mi Carrito POS — Sistema de facturación electrónica para Perú.*

---

## Estabilización de ventas, caja y sincronización

Consulta `MEJORAS_ESTABILIDAD.md` antes de actualizar una instalación existente. Incluye las migraciones `1700000000002` y `1700000000003`, pagos mixtos, caja, idempotencia offline e inventario multisucursal. Para el criterio de asignación del saldo histórico y el módulo de transferencias, consulta `ETAPA_2_INVENTARIO_MULTISUCURSAL.md`. La integración OSE/SUNAT de esta versión sigue siendo simulada y no debe usarse para emitir comprobantes tributarios reales.


## Etapa 3 — Compras, proveedores y costos

Se agregó el módulo administrativo de proveedores, registro de compras y recepción de mercadería, cuentas por pagar, pagos a proveedores y reporte de rentabilidad bruta por producto. La recepción actualiza el stock y el costo promedio ponderado de cada producto en la sucursal seleccionada. Consulta `ETAPA_3_COMPRAS_PROVEEDORES.md` para la migración y las limitaciones.

**Importante:** los costos capturados en compras incluyen IGV. El stock heredado de versiones anteriores se migra con costo promedio `0` porque no existe una fuente fiable del costo histórico; las líneas de ventas que no tengan costo histórico se muestran por separado y no se incluyen en el cálculo de utilidad. La integración SUNAT/OSE sigue siendo simulada y esta versión aún requiere compilación y pruebas de integración en un entorno con dependencias y PostgreSQL.


## Etapa 4 — crédito y cobranzas

La v1.4.0 incorporó cuentas por cobrar por comprobante, crédito mixto (abono inmediato + saldo financiado), vencimiento por defecto a 30 días, pagos parciales, historial idempotente y conciliación de caja. La migración `1700000000005-cuentas-cobrar-cobranzas.ts` reconstruye los créditos históricos a partir de los pagos registrados y reconcilia el saldo global de cada cliente con sus cuentas abiertas. Requiere respaldo antes de ejecutar.

La pantalla **Cobranzas** permite consultar la cartera por sucursal, ver antigüedad de vencimientos, revisar el historial de abonos y aplicar pagos. Para usarla, ejecute primero todas las migraciones pendientes y publique backend y frontend de la misma versión.

### Endurecimiento de crédito y cobranzas (v1.4.1)

La versión 1.4.1 mejora la idempotencia de abonos, conserva claves de reintento ante cortes de conexión, fija los cálculos de vencimiento a la fecha de Perú, mantiene saldos de un céntimo sin marcarlos como pagados y protege el saldo del cliente frente a ediciones concurrentes. La venta permite configurar la fecha de vencimiento y exige conexión para validar crédito nuevo. Se agregaron indicadores de crédito utilizado y disponible a la ficha de clientes.


## Etapa 5 — Devoluciones de clientes (v1.5.0)

Se incorporó el registro de devoluciones parciales/totales desde el comprobante original. El servidor calcula nuevamente cantidades e importes, evita exceder lo vendido, aplica primero la devolución contra el saldo de crédito pendiente y reembolsa únicamente el excedente mediante efectivo, tarjeta, Yape o Plin. Yape y Plin exigen referencia de operación. Si corresponde reingreso, actualiza el inventario de la sucursal y registra el movimiento; el reembolso genera una salida en la caja abierta del usuario.

La operación utiliza clave idempotente con huella del contenido y bloqueo transaccional para proteger reintentos. Las devoluciones se filtran por empresa y sucursales asignadas; solo ADMIN puede registrarlas. Una venta con devolución no puede anularse mediante el procedimiento simple, evitando duplicar stock o reembolsos. Las cuentas de crédito que se cierran por devolución quedan identificadas como `AJUSTADA`, separadas de una cuenta cobrada.

Ejecutar la nueva migración `1700000000006-devoluciones-ventas.ts` después de las migraciones anteriores. Requiere respaldo y staging. La devolución comercial registrada en el POS **no emite por sí sola una nota de crédito electrónica ni una comunicación SUNAT/OSE**; ese proceso tributario sigue pendiente de integración real.

## Etapa 6 — Lotes, vencimientos y devoluciones a proveedores (v1.6.0)

La migración reversible `1700000000007-lotes-devoluciones-proveedor.ts` agrega lotes por sucursal con cantidad y fecha de vencimiento. El stock ya existente queda representado como lote de apertura sin fecha inventada; las compras nuevas pueden registrar código y vencimiento de cada lote. Las ventas consumen primero el lote con vencimiento más próximo (FEFO), bloquean lotes vencidos y guardan asignaciones para poder restituir exactamente los lotes en una anulación.

Los ajustes de entrada/salida, transferencias y devoluciones de clientes también mantienen el saldo de lotes. Las alertas de vencidos y próximos a vencer se muestran en Compras; la API es `GET /api/inventario/vencimientos?dias=30`.

En Compras, abra una compra recibida y use **Devolver** en una línea para registrar la devolución al proveedor. El backend verifica existencias y cantidades retornadas bajo transacción e idempotencia; la nota reduce primero el saldo pendiente de esa compra y el excedente queda como saldo a favor visible en el resultado. No se inventa un pago o salida de caja para notas de crédito.

Venta Rápida incluye campo para lectores USB/Bluetooth tipo teclado (enfóquelo antes de escanear) y lectura por cámara en Android mediante `BarcodeDetector` nativo si el navegador lo soporta. Para la cámara se necesita permiso del usuario y HTTPS o localhost.

### Actualización desde v1.5.0

1. Respalde PostgreSQL y el proyecto; conserve los archivos `.env` existentes.
2. Instale dependencias en `backend` y `frontend` según sus instrucciones actuales.
3. Conecte el backend a la base existente y ejecute `npm run migration:run` una vez. Se aplicarán solo las migraciones pendientes, incluida la nueva `1700000000007`.
4. No vuelva a ejecutar el SQL inicial ni borre tablas o volúmenes.

La reversión se rechaza si ya hay lotes recibidos, devoluciones o ventas con asignación de lote, para no borrar historial operativo. Revise/registre fechas reales al recibir mercadería; las fechas de productos antiguos no se pueden deducir del stock histórico.

### Verificación y límites

Se agregaron pruebas unitarias al cálculo de distribución de notas de crédito del proveedor. Este ZIP no incluye dependencias instaladas: no se ejecutaron builds completos, pruebas de PostgreSQL ni pruebas de extremo a extremo con escáner/cámara. La emisión SUNAT/OSE sigue siendo MOCK.

## Etapa 7 — Permisos de descuentos y caja (v1.7.0)

Los descuentos en venta ahora requieren rol ADMIN y un motivo de al menos cinco caracteres, que queda guardado en el comprobante. El backend es la autoridad; la interfaz solo muestra los controles a administradores. Los movimientos manuales de caja también quedan restringidos a ADMIN. CAJERO conserva apertura/cierre de su caja y consulta del historial.

Las anulaciones, ajustes de inventario, transferencias, compras y devoluciones ya estaban limitadas a ADMIN. La nueva migración `1700000000008-autorizacion-descuentos.ts` agrega el campo de auditoría opcional para conservar los comprobantes antiguos.

## Etapa 8 — Notas vinculadas y abonos de crédito (v1.8.0)

Una devolución registrada puede originar una nota de crédito vinculada a la factura/boleta original. La nota toma las líneas e importes del registro de devolución; no vuelve a modificar inventario, cuentas por cobrar ni caja, porque esos efectos ya ocurrieron al registrar la devolución. La reducción de deuda respeta los abonos iniciales y posteriores: primero se aplica el monto aún pendiente y solo el excedente se reembolsa mediante el flujo existente de Devoluciones.

Se incorporó una nota de débito por aumento de valor (Catálogo SUNAT 09, código 02). La operación queda vinculada al comprobante original, abre una cuenta por cobrar por el importe adicional con vencimiento a 30 días y aumenta el saldo del cliente dentro de una transacción idempotente. El cliente puede pagar esa cuenta desde **Cobranzas**.

Endpoints ADMIN: `POST /api/devoluciones/:id/nota-credito` y `POST /api/ventas/:id/notas-debito`. Las notas se agregan a la cola electrónica y producen XML UBL con referencia y motivo. La firma y el adaptador OSE de este proyecto siguen siendo simulados; los XML no están certificados para emisión tributaria real.

Los abonos al crédito ya se admitían desde etapas previas: venta mixta (abono inmediato más saldo financiado) y pagos parciales posteriores desde Cobranzas. Esta etapa conserva esos cobros y usa el saldo restante para calcular la reducción por devolución.

La migración `1700000000009-notas-credito-debito.ts` agrega las referencias/motivos y series NC01/ND01 faltantes. Al actualizar desde v1.7.0, respalde la base y ejecute `npm run migration:run`. Su reversión se detiene si ya hay notas vinculadas.

Al actualizar desde v1.6.0, respalde la base y ejecute `npm run migration:run` para aplicar las migraciones pendientes. La nueva migración no modifica comprobantes anteriores. Consulte `ETAPA_7_CONTROLES_ROL.md` para el detalle.


## Etapa 9 — Cloudflare Pages y preparación SUNAT (v1.9.0)

- Se incorpora despliegue de la interfaz React en Cloudflare Pages (`frontend/wrangler.toml`, salida `dist`).
- Se agrega fallback SPA para rutas de React Router y cabeceras HTTP de seguridad.
- Se incorpora una Pages Function como proxy same-origin para `/api/*`; conserva autenticación y query string, evita caché y no expone `API_ORIGIN` al bundle del navegador.
- Se agregan pruebas nativas Node para la función proxy.
- Se documenta el estado real de SUNAT: UBL/OSE siguen en MOCK; esta versión prepara el proceso, no habilita emisión tributaria real.
- Se agrega `AUDITORIA_PRE_MIGRACION_SOLO_LECTURA.sql`, consulta de solo lectura para inspeccionar tablas, columnas, funciones y tablas de migración.
- No se ejecutó ni se agregó ninguna migración de base de datos en esta etapa.

**Pendiente arquitectónico crítico:** el backend NestJS y Bull/Redis todavía requieren un runtime Node persistente. Pages no lo sustituye. Para operar exclusivamente con Supabase y Cloudflare, falta migrar los endpoints transaccionales y trabajos asíncronos a servicios compatibles con Workers/Queues o Supabase Edge Functions, preservando atomicidad, idempotencia, autorización y colas de comprobantes.


## Etapa 10 — desacoplamiento de colas (v1.15.0)

Los servicios de facturación, resumen diario y comunicación de baja ya no inyectan directamente Bull. Usan el contrato `FeQueuePort`, actualmente implementado por `BullFeQueueAdapter`. Esto permite desarrollar un proveedor Cloudflare Queues sin alterar la lógica de dominio. Bull/Redis y el consumidor `FeProcessor` continúan activos; la migración serverless no está terminada. Consulta `ETAPA_10_ARQUITECTURA_CLOUD_NATIVA.md`.

No se ejecutaron migraciones ni se modificó Supabase.

### Etapa 11 (v1.15.0): identidad Supabase Auth preparada

Se añadió el campo opcional de vínculo `usuario.supabase_auth_user_id`, su migración TypeORM y una consulta de usuario activo por UUID. El inicio de sesión actual permanece sin cambios. **No ejecutar aún**: revisar `ETAPA_11_SUPABASE_AUTH_IDENTIDAD.md` y `SUPABASE_AUTH_MIGRATION_PREVIEW_NO_EJECUTAR.sql` antes de aprobar cualquier migración.


## Versión 1.16.0

La etapa 16 incorpora gestión administrativa de variantes y movimientos de stock por presentación desde el módulo Productos. Consulte `ETAPA_16_GESTION_VARIANTES_UI.md` y `RELEASE_NOTES_1.16.0.md`. No ejecutar migraciones por esta etapa.


## Etapa 17 — Modalidad de producto

Cada producto puede venderse como unidad única o como familia con variantes. Ver `ETAPA_17_PRODUCTO_UNICO_O_VARIANTES.md`. La migración 0014 está incluida y pendiente de ejecución.


## Etapa 18 — Compras por presentación

La recepción de compras actualiza inventario y costo promedio por variante. Revisar `ETAPA_18_COMPRAS_VARIANTES.md`. Migración 0015 incluida y pendiente de aprobación.


## Versión 1.44.60

Ver `RELEASE_NOTES_1.44.60.md` y `ETAPA_1_44.60_CONCILIACION_PAGOS.md`. La validación de pagos exige coincidencia exacta a dos decimales; no activar cobros remotos sin pruebas de staging.


## Versión 1.44.61

Resumen autenticado de caja en Supabase: `RELEASE_NOTES_1.44.61.md` y `ETAPA_1_44.61_RESUMEN_CAJA_SUPABASE.md`. Solo lectura; apertura, movimientos, cierre y devoluciones aún no migrados.


## Versión 1.44.62

Ciclo de caja transaccional (RPC y Cloudflare Edge): `RELEASE_NOTES_1.44.62.md` y `ETAPA_1_44.62_CICLO_CAJA_SUPABASE.md`. La interfaz aún no se ha conmutado a estos endpoints.


## Versión 1.44.65

Consulta `RELEASE_NOTES_1.44.65.md` para la conexión de la pantalla Caja con Supabase Auth y Cloudflare. Las migraciones siguen siendo previews y no se han ejecutado.


## Despliegue Cloudflare Pages sin VPS (1.44.77)

Consulta [CLOUDFLARE_PAGES_1.44.77.md](CLOUDFLARE_PAGES_1.44.77.md) para configurar el proyecto en Cloudflare Pages, probar Preview y revisar los bloqueos antes de Production.


## Android / PWA (1.44.78)

Publica en Cloudflare Pages y sigue [ANDROID_PWA_1.44.78.md](ANDROID_PWA_1.44.78.md). No abras `index.html` desde el gestor de archivos.
