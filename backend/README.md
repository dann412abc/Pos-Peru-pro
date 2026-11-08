# Backend heredado de Mi Carrito POS — NestJS 10 (solo compatibilidad/migración)

> *Tu punto de venta, siempre contigo.*

Sistema de facturación electrónica POS para Perú.

> **Aviso de arquitectura v1.44.76:** este backend requiere un runtime Node persistente y Bull/Redis. Se conserva como referencia y para compatibilidad local durante la migración; no forma parte del runtime de producción objetivo sin VPS. No lo despliegues como requisito del producto final. Consulta `../AUDITORIA_NO_VPS_1.44.76.md`.

> **Nota de marca:** este proyecto se denominaba anteriormente "AYNI POS". El nombre de marca fue cambiado a **Mi Carrito POS**; el dominio SUNAT/IGV, los datos demo del emisor (COMERCIAL HUANCAYO S.A.C.) y el stack se mantienen inalterados. IGV 18%, moneda S/ (PEN), precios
de productos **incluyen IGV**. Comprobantes: factura (01), boleta (03), nota crédito
(07), nota débito (08). Facturación electrónica con XML UBL 2.1, adaptador OSE
**MOCK** (no llama a APIs reales de SUNAT/Nubefact), cola Bull (Redis) con backoff
exponencial y circuit breaker.

## Stack y justificación del ORM

- **NestJS 10 + TypeScript**, **PostgreSQL 15**, **Redis 7**.
- **ORM elegido: TypeORM** (en lugar de Prisma). Justificación:
  1. Integración nativa con NestJS (`@nestjs/typeorm`, `@InjectRepository`), sin paso
     de generación de cliente: el build funciona incluso sin acceso a la red ni a la BD.
  2. Entidades decoradas que coexisten naturalmente con DTOs y Swagger.
  3. Control explícito de migraciones SQL (synchronize desactivado) y de
     transacciones con `DataSource.transaction` (fundamental para el correlativo
     atómico y el descuento de stock).
  4. `NamingStrategy` personalizado que convierte camelCase (TypeScript) a
     snake_case (columnas PostgreSQL) de forma uniforme.
- Contraseñas con **bcryptjs** (JS puro, sin compilación nativa).

## Estructura de módulos

```
src/
  config/              # Configuracion de entorno
  common/              # Enums, motor IGV, validadores DNI/RUC, guards, decoradores, SnakeNamingStrategy
  auth/                # JWT access+refresh, Passport, login/refresh/perfil
  empresas/            # Tenants (RUC 11 digitos validado)
  sucursales/          # Sucursales por empresa
  usuarios/            # Usuarios con roles ADMIN/CAJERO y acceso multiple a sucursales
  categorias/          # Categorias de productos
  productos/           # Productos (precio incluye IGV, tipo_igv 10/20/30)
  clientes/            # Clientes, crédito, cuentas por cobrar y cobranzas parciales (DNI/RUC)
  ventas/              # Comprobantes, lineas, correlativo atomico, motor IGV, stock
  caja/                # Apertura/cierre con arqueo por metodo de pago
  fe/                  # Facturacion electronica: XML UBL 2.1, OSE mock, Bull queue,
                       #   circuit breaker, event-sourcing, Resumen Diario (RC), Comunicacion de Baja (RA)
  health/              # Endpoint /api/health
  database/            # DataSource, migraciones SQL, seed demo (Huancayo)
```

## Setup rápido

```bash
cp .env.example .env
npm install
npm run migration:run   # requiere PostgreSQL 15 accesible
npm run seed            # datos demo: empresa RUC demo 20601234565, sucursal BODEGA EL CENTRO (Huancayo),
                        # 10 productos, clientes, series F001/B001/NC01, usuarios admin/123456 y cajero/123456
npm run start:dev
```

Swagger/OpenAPI: `http://localhost:3000/api/docs`

Con Docker: `docker compose up -d` (postgres 15 + redis 7 + backend, con healthchecks).

## Scripts

| Comando | Descripción |
|---|---|
| `npm run start:dev` | Desarrollo con watch |
| `npm run build` | Compilar TypeScript a `dist/` |
| `npm run start:prod` | Ejecutar `dist/main.js` |
| `npm test` | Tests unitarios Jest (motor IGV, DNI/RUC, correlativo atómico, XML UBL, OSE mock) |
| `npm run migration:run` | Ejecutar migraciones pendientes |
| `npm run seed` | Cargar datos demo |

## Reglas de negocio implementadas

- **Motor IGV**: `base_imponible = (precio*cantidad - descuento_linea) / 1.18`;
  `igv = base * 0.18`. Exonerado (20) e inafecto (30) no suman IGV. Redondeo a 2
  decimales por línea y en totales.
- **Correlativo atómico**: `UPDATE serie_correlativo SET ultimo_correlativo =
  ultimo_correlativo + 1 ... RETURNING` dentro de transacción (row-lock).
- **Caja**: una sola abierta por sucursal+usuario (unique parcial). Cierre calcula
  `diferencia = efectivo_contado - (saldo_inicial + ventas_efectivo)` y arqueo por
  método de pago.
- **FE**: estados CREADO → FIRMADO → ENVIADO → ACEPTADO/RECHAZADO con event-sourcing
  (`fe_evento`). Cola Bull: 5 intentos, backoff exponencial. Circuit breaker: abre
  tras 5 fallos consecutivos, medio-abre tras 30s. Esqueletos de Resumen Diario (RC)
  y Comunicación de Baja (RA).
- **RBAC por sucursal**: el JWT incluye `sucursalIds`; `SucursalGuard` verifica el
  acceso; los servicios filtran por `empresaId`/`sucursalId`.

## Usuarios demo (seed)

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | 123456 | ADMIN |
| cajero | 123456 | CAJERO |

## Notas

- El adaptador OSE es **siempre MOCK**: `OSE_ENDPOINT` es solo configuración
  informativa; no se invoca ninguna API real. Para producción, implemente
  `OseAdapter` contra su OSE y registre el provider en `fe.module.ts`.
- `synchronize: false`: el esquema se gestiona solo con migraciones.


## Cuentas por cobrar (v1.4.1)

La migración `1700000000005-cuentas-cobrar-cobranzas.ts` debe ejecutarse después de las migraciones 0000–0004. Reconcilia el saldo del cliente con las cuentas abiertas detectadas a partir del desglose de pagos de comprobantes. Las ventas mixtas pueden incluir el medio `CREDITO`; el límite se valida con bloqueo de fila del cliente y solo se suma el importe financiado. Las cobranzas serializan claves idempotentes con un advisory lock transaccional, bloquean caja/cuenta/cliente en una secuencia estable y registran el movimiento de caja para efectivo, tarjeta, Yape y Plin. La transferencia queda en historial sin modificar el efectivo físico.

## Permisos de descuentos y movimientos de caja (v1.7.0)

La migración adicional es `1700000000008-autorizacion-descuentos.ts`. Solo ADMIN puede registrar descuentos en ventas, y el motivo (5–250 caracteres) se persiste en `comprobante.motivo_descuento`. Solo ADMIN puede registrar ingresos/egresos manuales de caja. CAJERO aún puede abrir y cerrar su propia caja y consultar sus movimientos. Respaldar la base antes de ejecutar migraciones pendientes.

## Lotes y devoluciones a proveedores (v1.6.0)

Tras respaldar una base existente, ejecute `npm run migration:run` una vez para aplicar las migraciones pendientes hasta `1700000000007-lotes-devoluciones-proveedor.ts`. Las líneas de compra permiten `codigoLote` y `fechaVencimiento`; `GET /api/inventario/vencimientos?dias=30` lista alertas; `POST /api/compras/:id/devoluciones` aplica devoluciones bajo transacción. Las ventas asignan lotes FEFO y bloquean vencidos. El `down` de 0007 se detiene si ya se guardaron operaciones con lotes.

## Notas vinculadas v1.8.0

La migración `1700000000009-notas-credito-debito.ts` añade referencias/motivos y series NC01/ND01 faltantes. `POST /api/devoluciones/:id/nota-credito` crea una nota desde la devolución ya registrada sin volver a contabilizar sus ajustes. `POST /api/ventas/:id/notas-debito` admite aumento de valor y crea una cuenta por cobrar independiente. Los adelantos de venta mixta y abonos parciales se conservan para Cobranzas. XML UBL generado; firma y OSE continúan MOCK.


## Correcciones de auditoría 1.43.1

Incluye alertas persistentes programables vía Cloudflare Worker, SMTP y WhatsApp Business Cloud API configurables con secretos del backend, administración multiempresa de usuarios/sucursales y marca persistente de comprobantes electrónicos simulados. Endpoints nuevos de administración: `GET/POST /api/usuarios`, `PATCH /api/usuarios/:id`, `PATCH /api/usuarios/:id/estado` y `PATCH /api/usuarios/:id/password`; todos los cambios de administración exigen ADMIN.

`OSE_MOCK=false` se rechaza deliberadamente: esta entrega no contiene un adaptador OSE real. Nunca debe interpretarse un estado ACEPTADO del mock como aceptación de SUNAT. Las migraciones 0022 y 0023 deben revisarse y ejecutarse primero en staging.


La autenticación vigente usa bcrypt/JWT propios del backend; el UUID de Supabase Auth es un vínculo opcional, no una sesión Supabase validada. Las migraciones de este paquete no activan RLS. El generador PDF sigue siendo una plantilla provisional y los envíos a clientes se bloquean mientras el comprobante no tenga aceptación real y PDF completo. Revisa `AUDITORIA_CORRECCIONES_1.43.1.md`.
