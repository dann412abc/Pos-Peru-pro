# Mi Carrito POS — API Reference (v1.5.0)

Base URL: `http://localhost:3000/api` · Documentación interactiva (Swagger/OpenAPI): `http://localhost:3000/api/docs`

Todas las rutas (salvo `/api/auth/login` y `/api/health`) requieren header `Authorization: Bearer <access_token>`. El acceso a datos se filtra por sucursal activa del usuario (RBAC por sucursal). Roles: `ADMIN`, `CAJERO`.

---

## 1. Autenticación — `/api/auth`

| Método | Endpoint | Descripción | Body / Params |
|---|---|---|---|
| POST | `/api/auth/login` | Login, devuelve access + refresh token | `{ usuario, password }` |
| POST | `/api/auth/refresh` | Renovar access token | `{ refreshToken }` |
| GET | `/api/auth/perfil` | Perfil del usuario autenticado | — |

## 2. Salud — `/api/health`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servicio (verifica conexión BD/Redis) |

## 3. Tenants y organización

| Método | Endpoint | Descripción |
|---|---|---|
| GET/POST | `/api/empresas` | Listar / crear empresas (tenant). RUC validado: 11 dígitos, prefijo permitido y dígito verificador módulo 11 |
| GET | `/api/empresas/:id` | Detalle de empresa |
| GET/POST | `/api/sucursales` | Listar / crear sucursales (pertenecen a una empresa) |
| GET | `/api/sucursales/:id` | Detalle de sucursal |
| GET | `/api/usuarios` | Listar usuarios (solo ADMIN) |
| GET | `/api/usuarios/me` | Usuario actual |

## 4. Catálogos

| Método | Endpoint | Descripción |
|---|---|---|
| GET/POST | `/api/categorias` | Listar / crear categorías |
| GET | `/api/categorias/:id` | Detalle de categoría |
| GET/POST | `/api/productos` | Listar (filtro por categoría/búsqueda) / crear producto. `tipo_igv`: 10 gravado / 20 exonerado / 30 inafecto. Precio incluye IGV |
| GET | `/api/productos/:id` | Detalle de producto |
| PUT | `/api/productos/:id` | Actualizar producto |
| DELETE | `/api/productos/:id` | Eliminar (soft) producto |
| GET/POST | `/api/clientes` | Listar / crear cliente. Validación DNI=8 dígitos / RUC=11 dígitos, prefijo permitido y dígito verificador módulo 11. Campos: tipo_doc, numero, nombre, direccion, telefono, email, limite_credito |
| GET | `/api/clientes/:id` | Detalle de cliente |
| GET | `/api/clientes/cuentas-por-cobrar` | Cuentas abiertas de sucursales autorizadas; acepta `sucursalId` y `estado` (`PENDIENTE`, `PARCIAL`, `PAGADA`, `ANULADA`) | query params |
| GET | `/api/clientes/cuentas-por-cobrar/resumen` | Cartera vigente y vencida agrupada por antigüedad | query `sucursalId` |
| GET | `/api/clientes/cuentas-por-cobrar/:id` | Detalle de cuenta e historial de cobros | — |
| POST | `/api/clientes/cuentas-por-cobrar/:id/cobros` | Aplicar abono parcial o total; requiere caja abierta para EFECTIVO/TARJETA/YAPE/PLIN. TRANSFERENCIA requiere referencia bancaria | `{ metodoPago, monto, referencia?, idempotencyKey }` |

## 5. Ventas — `/api/ventas`

| Método | Endpoint | Descripción | Body |
|---|---|---|---|
| POST | `/api/ventas` | Crear venta/comprobante. Serie+correlativo atómico por sucursal; descuenta stock; calcula IGV (18%) por línea | `{ tipoComprobante (01/03/07/08), clienteId, lineas: [{productoId, cantidad, precioUnitario, descuento, tipoIgv}], metodoPago, montoRecibido, pagos?: [...] }` |
| GET | `/api/ventas` | Listar ventas con filtros (fecha, tipo, estado, cliente) | query params |
| GET | `/api/ventas/:id` | Detalle de venta con líneas y totales | — |
| POST | `/api/ventas/:id/anular` | Anular venta (genera Comunicación de Baja) | — |

**Respuesta de totales**: `opGravadas`, `opExoneradas`, `opInafectas`, `descuento`, `totalIgv`, `total`, `vuelto`.

## 6. Caja — `/api/caja`

| Método | Endpoint | Descripción | Body |
|---|---|---|---|
| POST | `/api/caja/apertura` | Abrir caja (una sola abierta por sucursal+usuario) | `{ saldoInicial }` |
| POST | `/api/caja/:id/cierre` | Cerrar caja con arqueo | `{ efectivoContado, arqueoPorMetodo }` → devuelve `diferencia` |
| GET | `/api/caja/estado` | Estado de caja actual (abierta/cerrada) | — |

## 7. Facturación Electrónica — `/api/fe`

| Método | Endpoint | Descripción | Params |
|---|---|---|---|
| GET | `/api/fe/comprobantes` | Listar comprobantes electrónicos con estado (CREADO/FIRMADO/ENVIADO/ACEPTADO/RECHAZADO) | filtros |
| GET | `/api/fe/comprobantes/:id` | Detalle + historial de eventos (event-sourcing) + CDR/observaciones | — |
| GET | `/api/fe/comprobantes/:id/pdf` | Descargar PDF representante | query `formato=58mm\|80mm\|A5` (default 80mm) |
| POST | `/api/fe/comprobantes/:comprobanteId/enviar` | Reenviar a la OSE (reintenta por cola Bull) | — |
| POST | `/api/fe/comprobantes/:comprobanteId/enviar-email` | Enviar comprobante por email (usa el del cliente por defecto) | body opcional `{ email }` |
| POST | `/api/fe/comprobantes/:comprobanteId/enviar-whatsapp` | Enviar por WhatsApp (formatea a 51+9 dígitos) | body opcional `{ numero }` |
| POST | `/api/fe/resumen-diario` | Generar Resumen Diario (RC) del día | `{ fecha? }` |
| POST | `/api/fe/comunicacion-baja` | Generar Comunicación de Baja (RA) | `{ comprobanteIds: [] }` |

## 8. Notificaciones — `/api/notificaciones`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/notificaciones/envios` | Historial de envíos por sucursal autorizada |
| GET | `/api/notificaciones/configuracion` | Estado de canales y de modo SUNAT, sin devolver secretos (ADMIN) |
| POST | `/api/notificaciones/prueba/email` | Correo SMTP de prueba `{ destino }` (ADMIN) |
| POST | `/api/notificaciones/prueba/whatsapp` | Mensaje WhatsApp de prueba `{ destino }` (ADMIN) |
| POST | `/api/internal/cron/alertas` | Sincronización de alertas con header `x-cron-secret` (Worker interno) |
| PATCH | `/api/empresas/actual` | Actualizar datos fiscales de la empresa activa (ADMIN) |

### Administración de usuarios — `/api/usuarios`

| Método | Endpoint | Descripción | Body |
|---|---|---|---|
| GET | `/api/usuarios` | Usuarios de la empresa, sin hashes ni UUID internos (ADMIN) | — |
| POST | `/api/usuarios` | Crear ADMIN/CAJERO y asignar una o más sucursales de la misma empresa (ADMIN) | `{ username, nombre, password, rol, sucursalIds }` |
| PATCH | `/api/usuarios/:id` | Actualizar nombre, rol y sucursales de un usuario del tenant (ADMIN) | `{ nombre?, rol?, sucursalIds? }` |
| PATCH | `/api/usuarios/:id/estado` | Activar/desactivar sin borrar historial; protege último administrador y sesión propia (ADMIN) | `{ activo: boolean }` |
| PATCH | `/api/usuarios/:id/password` | Restablecer contraseña, guardada con bcrypt (ADMIN) | `{ password }` |

---

## Variables de entorno relevantes (backend/.env)

- `OSE_MOCK=true` · `OSE_ENDPOINT` — el paquete usa un adaptador MOCK; `OSE_MOCK=false` se rechaza porque no incluye un adaptador OSE real.
- `FORMATO_TICKET_DEFAULT=80mm` — formato PDF/ticket por defecto.
- `ENVIO_AUTOMATICO_EMAIL=true/false` y `ENVIO_AUTOMATICO_WHATSAPP=true/false` — canales automáticos al procesar un comprobante aceptado (vía Bull).
- `CRON_SECRET` — secreto de al menos 32 caracteres para que Cloudflare Worker ejecute el cron protegido de alertas.
- `SMTP_HOST/PORT/USER/PASS/FROM` — email real vía Nodemailer; sin SMTP, el historial etiqueta los envíos como simulados.
- `WHATSAPP_PHONE_NUMBER_ID/ACCESS_TOKEN/API_VERSION/VERIFY_TOKEN` — WhatsApp Business Cloud API; sin credenciales no se declara enviada una prueba de conectividad.

*Mi Carrito POS — Sistema de facturación electrónica para Perú.*


## Inventario por sucursal y traslados

- `GET /api/productos?sucursalId=1` — lista productos con el saldo de esa sucursal. El ID debe estar asignado al usuario.
- `GET /api/productos/:id?sucursalId=1` — detalle del producto con saldo local.
- `POST /api/inventario/transferencias` — (ADMIN) transfiere una o más líneas entre dos sucursales autorizadas. La operación actualiza ambos saldos en una transacción y genera movimientos de salida/entrada enlazados por `transferenciaId`. Puede incluir `idempotencyKey` para que un reintento no duplique el traslado.
- `GET /api/inventario/transferencias` — lista las últimas 100 transferencias entre sucursales asignadas al usuario, incluyendo responsable, motivo y productos.
- `POST /api/inventario/movimientos` — (ADMIN) ajusta existencias de una sola sucursal.
- `GET /api/inventario/movimientos` — consulta los movimientos de las sucursales autorizadas. Los movimientos muestran `stockAnterior`, `stockPosterior` y, cuando corresponda, `transferenciaId`.

Ejemplo de transferencia:

```json
{
  "sucursalOrigenId": 1,
  "sucursalDestinoId": 2,
  "motivo": "Reposición de mercadería",
  "lineas": [
    { "productoId": 12, "cantidad": 8 },
    { "productoId": 15, "cantidad": 2.5 }
  ]
}
```

## Compras, proveedores y cuentas por pagar — `/api/compras`

Las rutas de creación, edición, pago y anulación requieren rol `ADMIN`. Las consultas están limitadas a la empresa y a las sucursales asignadas al usuario. Los costos unitarios de compra se capturan **con IGV incluido**; el costo promedio se mantiene por producto y sucursal.

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/compras/proveedores` | Listar proveedores activos de la empresa. `incluirInactivos=true` solo para ADMIN |
| POST | `/api/compras/proveedores` | Crear proveedor con RUC, DNI u otro documento |
| PUT | `/api/compras/proveedores/:id` | Actualizar proveedor |
| DELETE | `/api/compras/proveedores/:id` | Desactivar proveedor sin borrar su historial |
| GET | `/api/compras?sucursalId=1` | Listar últimas 300 compras de la sucursal |
| GET | `/api/compras/:id` | Detalle con líneas y pagos |
| POST | `/api/compras` | Registrar compra y recibir existencias; actualiza costo promedio en una transacción |
| GET | `/api/compras/cuentas-por-pagar?sucursalId=1` | Listar saldos pendientes por proveedor |
| GET | `/api/compras/cajas-abiertas?sucursalId=1` | Cajas abiertas del usuario para registrar pagos |
| POST | `/api/compras/:id/pagos` | Aplicar pago parcial o total al proveedor |
| POST | `/api/compras/:id/anular` | Revertir compra solo si no hubo pagos ni salidas posteriores que comprometan el inventario |

Ejemplo de compra:

```json
{
  "sucursalId": 1,
  "proveedorId": 4,
  "tipoDocumento": "01",
  "serie": "F001",
  "numero": "00001234",
  "fechaDocumento": "2026-11-05",
  "condicionPago": "CONTADO",
  "idempotencyKey": "purchase-unique-key-0001",
  "lineas": [
    { "productoId": 12, "cantidad": 24, "costoUnitario": 2.50, "tipoIgv": 10 }
  ],
  "pagos": [
    { "metodoPago": "EFECTIVO", "monto": 60.00, "cajaId": 7, "idempotencyKey": "payment-unique-0001" }
  ]
}
```

`costoUnitario` incluye IGV cuando el producto es gravado. El sistema separa base e IGV para el registro y actualiza el costo promedio ponderado. Para pagos en efectivo, tarjeta, Yape o Plin se requiere una caja abierta del usuario en la sucursal; una transferencia bancaria no genera movimiento de caja. En compras a crédito puede existir saldo pendiente y aplicarse pagos posteriores.

El endpoint `GET /api/ventas/rentabilidad` (solo ADMIN) devuelve ventas netas, costo de mercadería, utilidad bruta y margen por producto en el periodo. Las ventas antiguas sin costo histórico se identifican aparte y no se consideran al calcular utilidad o margen.


## Cuentas por cobrar y cobranzas — `/api/clientes/cuentas-por-cobrar`

Una venta puede distribuirse entre medios inmediatos y crédito; por ejemplo, EFECTIVO S/ 20 + CREDITO S/ 30. La suma de todos los medios debe coincidir exactamente con el total de la venta. Solo el componente CREDITO consume el límite del cliente y crea la cuenta por cobrar. Si no se informa `fechaVencimiento`, se asignan 30 días desde el registro.

Ejemplo de distribución en una venta de S/ 50:

```json
{
  "pagos": [
    { "metodo": "EFECTIVO", "monto": 20, "montoRecibido": 20 },
    { "metodo": "CREDITO", "monto": 30 }
  ]
}
```

Los cobros posteriores son parciales o totales y quedan enlazados a la cuenta, cliente, usuario y comprobante. Los medios de pago que necesitan conciliación de turno generan un ingreso de caja; las transferencias bancarias quedan en el historial de cobranza y no suman efectivo físico. Los reintentos usan `idempotencyKey`. Una venta con cobranzas aplicadas no puede anularse por el flujo simple de anulación; requiere una devolución/regularización separada para no borrar cobros ya recibidos.

El filtro `estado=CERRADAS` permite consultar cuentas `PAGADA`, `AJUSTADA` y `ANULADA`; sin filtro se muestran únicamente cuentas abiertas `PENDIENTE` y `PARCIAL`.

## Endurecimiento de cobranzas en v1.4.1

El endpoint `POST /api/clientes/cuentas-por-cobrar/:id/cobros` requiere `idempotencyKey` estable por intento. Un reintento debe conservar exactamente cuenta, monto, método y referencia; el servidor serializa solicitudes simultáneas con un advisory lock transaccional y, si la misma clave se usa con datos distintos, responde conflicto. Los reportes de vencimiento usan la fecha local `America/Lima`. El resumen de caja mantiene el saldo de crédito no cobrado y lo reduce conforme ingresan abonos, evitando contar dos veces el mismo importe. Una anulación simple queda bloqueada ante cualquier cobranza positiva, incluso de S/ 0.01.


## 9. Devoluciones de clientes — `/api/devoluciones` (v1.5.0)

La consulta de disponibilidad muestra las cantidades e importes todavía reembolsables de cada línea. El servidor valida nuevamente la venta y registra la devolución en una sola transacción. Solo ADMIN puede registrar; consultas limitadas a la empresa y sucursales autorizadas. Cada devolución exige una caja abierta del usuario en la sucursal de la venta para dejar trazabilidad, incluso si todo el importe compensa crédito pendiente.

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/devoluciones?sucursalId=1` | Historial (últimas 300) de sucursales autorizadas |
| GET | `/api/devoluciones/ventas/buscar?q=texto&sucursalId=1` | Buscar comprobantes antiguos por serie, número, cliente o DNI/RUC (máximo 100) |
| GET | `/api/devoluciones/ventas/:comprobanteId/disponibilidad` | Consulta las líneas, cantidades devueltas y saldos aún disponibles |
| POST | `/api/devoluciones/ventas/:comprobanteId` | Registrar devolución; solo ADMIN, exige `idempotencyKey` estable |
| GET | `/api/devoluciones/:id` | Ver detalle, líneas y medios de reembolso |

Ejemplo de devolución con reembolso mixto:

```json
{
  "motivo": "Producto defectuoso reportado por el cliente",
  "idempotencyKey": "return-sale-184-unique-001",
  "lineas": [
    { "comprobanteLineaId": 991, "cantidad": 2, "reingresarStock": true }
  ],
  "pagos": [
    { "metodoPago": "EFECTIVO", "monto": 10.00 },
    { "metodoPago": "YAPE", "monto": 5.00, "referencia": "OP-123456" }
  ]
}
```

Los pagos del ejemplo deben sumar exactamente el importe que queda por reembolsar después de compensar el crédito pendiente; no se debe enviar el importe bruto de la devolución si existe saldo financiado. Medios válidos: `EFECTIVO`, `TARJETA`, `YAPE`, `PLIN`; Yape/Plin requieren `referencia`. `reingresarStock=false` registra la devolución comercial sin volver a poner esa unidad en existencias vendibles.

La migración nueva es `1700000000006-devoluciones-ventas.ts`. Debe ejecutarse después de las migraciones 0000–0005 con respaldo previo. La operación no emite todavía la nota de crédito electrónica ni reporta automáticamente la baja a SUNAT/OSE.

## Lotes y devoluciones a proveedores (v1.6.0)

- `GET /api/inventario/vencimientos?dias=30`: lista lotes vencidos y por vencer para las sucursales del usuario.
- `POST /api/compras/:id/devoluciones` (ADMIN): `{ "motivo": "...", "idempotencyKey": "...", "lineas": [{ "compraLineaId": 123, "cantidad": 1 }] }`. El servidor descuenta el lote/stock y aplica el crédito primero al saldo pendiente de la compra. La respuesta incluye `total`, `aplicadoCuenta`, `saldoAFavor` y `lineas`.

## Notas de crédito y débito (v1.8.0)

- `POST /api/devoluciones/:id/nota-credito` (ADMIN): genera una nota de crédito código 06 (devolución total) o 07 (parcial) vinculada a una devolución registrada y a su factura/boleta. Es idempotente por devolución. No vuelve a tocar inventario, saldo ni caja: esos asientos ya fueron aplicados por el flujo de devolución, incluyendo abonos previos al crédito.
- `POST /api/ventas/:id/notas-debito` (ADMIN): `{ "comprobanteLineaId": 123, "monto": 12.5, "motivo": "Aumento de valor acordado", "idempotencyKey": "debit-note-uuid" }`. Admite aumento de valor, código 02, sobre una línea elegida del original. La transacción crea una cuenta por cobrar adicional con vencimiento en 30 días y actualiza el saldo global del cliente; los abonos a esa cuenta se registran en Cobranzas.

Ambos endpoints generan XML UBL y los agregan a la cola FE. La firma y el adaptador OSE continúan en modo simulado; no usar para emitir documentos tributarios reales.

La migración `1700000000007-lotes-devoluciones-proveedor.ts` debe ejecutarse tras las anteriores con respaldo. El escáner de Venta Rápida acepta teclado tipo wedge con el campo enfocado; la cámara Android usa BarcodeDetector si está disponible y requiere HTTPS/localhost.

## Control de permisos v1.7.0

- `POST /api/ventas`: ADMIN puede aplicar descuentos por línea enviando `motivoDescuento` (5–250 caracteres); CAJERO recibe `403` si envía un descuento mayor que cero.
- `POST /api/caja/:id/movimientos`: solo ADMIN; el historial sigue consultable por usuarios autorizados de la sucursal.
- Apertura/cierre de caja por el usuario y sucursal autorizada se mantienen disponibles para ADMIN y CAJERO. Anulaciones y ajustes/transferencias de inventario ya son solo ADMIN.

Ejecute la migración `1700000000008-autorizacion-descuentos.ts` tras respaldar la base. `motivo_descuento` se conserva en el comprobante para auditoría.
