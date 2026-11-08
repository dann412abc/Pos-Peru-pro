# Mi Carrito POS v1.43.1 — Frontend (componente del sistema integrado)

Sistema POS con facturación electrónica para Perú. React 18 + TypeScript + Vite + Tailwind CSS.

## Puesta en marcha

No abras `index.html` con doble clic: Vite necesita servir los módulos de React. Si lo abres directamente, la página muestra estas instrucciones.

En PowerShell de Windows, si `npm` muestra que la ejecución de scripts está deshabilitada, usa `npm.cmd install` y `npm.cmd run dev` desde esta carpeta. No es necesario cambiar la política de ejecución.

```bash
npm install
cp .env.example .env   # ajustar VITE_API_URL si se tiene backend
npm run dev            # http://localhost:5173
```

Build de producción:

```bash
npm run build   # tsc && vite build → dist/
npm run preview
```

Tests del motor de cálculo IGV:

```bash
npm test   # Vitest (9 tests en src/utils/igv.test.ts)
```

## Cuentas demo (modo offline, sin backend)

- `admin` / `123456` — rol ADMIN (ve Reportes y Configuración)
- `cajero` / `123456` — rol CAJERO

## Características

- IGV 18% con precios incluidos: `base = precio / 1.18`, `igv = base * 0.18`. Exonerados (20) e inafectos (30) no suman IGV. Redondeo a 2 decimales. Motor puro y testeable en `src/utils/igv.ts`.
- Validación: DNI 8 dígitos; RUC 11 dígitos con prefijo permitido y dígito verificador módulo 11.
- Series: F001 factura (01), B001 boleta (03), NC01 nota crédito (07), ND nota débito (08).
- Métodos de pago: EFECTIVO (con vuelto automático), TARJETA, YAPE, PLIN, CREDITO.
- Offline-first con Dexie (IndexedDB): ventas encoladas en `pending_sales`/`pending_docs`, reintento automático al recuperar conexión (evento `online`).
- Cliente Axios con interceptor JWT y refresh automático de token.
- Ticket imprimible con QR generado con la librería `qrcode`.
- Tokens de diseño: primario #1B4B6F, acento ámbar #D97706.

## Formatos de ticket (58mm / 80mm / A5)

El ticket se puede imprimir en 3 formatos, seleccionables en el modal de impresión (junto al botón Imprimir) y con valor por defecto en **Configuración → Formato de ticket** (se guarda en Dexie `config.formatoTicket` y en `localStorage` clave `formato_ticket_default`):

- **58 mm** — impresora térmica pequeña. `@page ticket-58 { size: 58mm auto; margin: 0 }`, fuente 10px, QR 96px.
- **80 mm** — impresora térmica estándar POS. `@page ticket-80 { size: 80mm auto; margin: 0 }`, fuente 11px, QR 120px.
- **A5** — impresora láser/inkjet. `@page ticket-a5 { size: A5; margin: 10mm }`, fuente 13px, QR 160px.

El formato aplica la clase `ticket-58` / `ticket-80` / `ticket-a5` al contenedor `#ticket-imprimible` y `qr-58` / `qr-80` / `qr-a5` al QR. En `@media print` se oculta todo elemento con clase `.no-print` (botones, selectores). Se usan páginas nombradas CSS (`page: ticket-58`) para que el navegador aplique el tamaño de papel correcto (compatible con Chrome/Edge).

## Envío de comprobantes (WhatsApp y correo)

Componente reutilizable `src/components/EnvioComprobante.tsx` (usado en TicketModal y en cada fila de Ventas):

- **WhatsApp**: diálogo con número precargado del cliente (`telefono`). Se normaliza a formato internacional Perú con `formatearWhatsApp()` en `src/utils/notificaciones.ts` (prefijo `51` + 9 dígitos, sin `+` ni espacios). Al confirmar abre `https://wa.me/<numero>?text=<mensaje>` en nueva pestaña. Mensaje prearmado con serie/correlativo, negocio, total y URL de descarga (`VITE_COMPROBANTE_URL_BASE`).
- **Correo**: diálogo con email precargado del cliente (campo `email` agregado a `Cliente` y al CRUD de Clientes). Al confirmar llama a `POST /api/fe/comprobantes/:comprobanteId/enviar-email` (el ID debe existir en el backend); si está offline y la venta ya tiene `serverId`, encola en `pending_docs`; los fallos de entrega quedan en revisión manual para evitar correos duplicados.
- **Configuración → Notificaciones**: muestra el estado de credenciales y la disponibilidad de plantilla. Los envíos automáticos se habilitan mediante variables privadas del backend; no se almacenan secretos ni toggles de envío en el navegador.

## Estructura

```
src/
  api/client.ts        Axios + JWT + refresh
  api/syncQueue.ts     Cola offline + reintento online
  db/index.ts          Dexie schema + seed demo
  context/AuthContext.tsx  Login, usuario, rol, sucursal, logout
  components/layout/   Sidebar, Header (reloj vivo, estado caja), Layout
  components/ui/Modal.tsx
  components/TicketModal.tsx  Ticket con QR
  pages/               Login, Dashboard, VentaRapida, Productos, Clientes,
                       Ventas, Cobranzas, FacturacionElectronica, CierreCaja, Reportes, Configuracion
  types/index.ts       Tipos del dominio
  utils/igv.ts         Motor IGV (calcularLinea, calcularTotales, validarDNI, validarRUC, formatearMoneda)
  utils/igv.test.ts    Tests Vitest
```

## Verificación de la entrega v1.43.1

El frontend forma parte de la entrega integrada descrita en el README de la raíz. En esta revisión, los 230 archivos fuente TypeScript/TSX del repositorio pasaron el análisis sintáctico; el build Vite no se pudo completar porque la instalación de dependencias desde npm excedió el tiempo disponible. Ejecuta `npm ci` y `npm run build` desde esta carpeta antes de desplegar.

La opción manual de WhatsApp de esta interfaz abre `wa.me`; los envíos automáticos desde backend usan WhatsApp Business Cloud API y requieren plantilla aprobada de Meta configurada en el servidor.

## Cobranzas

La pantalla `src/pages/Cobranzas.tsx` consulta la cartera autorizada del usuario, resume saldos por antigüedad, muestra el historial de abonos y permite pagos parciales por efectivo, Yape, Plin, tarjeta o transferencia. El servidor exige caja abierta para medios que se registran en caja; la transferencia exige referencia bancaria y se conserva como movimiento de cobranza sin alterar el efectivo esperado.


El envío por correo se rechaza hasta que exista aceptación real de SUNAT/OSE y un generador PDF completo. Un resultado marcado como simulado no significa que el correo haya llegado al destinatario.

## Despliegue Cloudflare Pages sin VPS — release 1.44.77

La guía oficial de esta entrega está en `../CLOUDFLARE_PAGES_1.44.77.md`. Configura Pages con root `frontend`, build `npm ci && npm run build` y output `dist`. Las Pages Functions se publican desde `frontend/functions` al desplegar el proyecto completo desde Git/Wrangler.

Para recorrer pantallas en Preview, configura `VITE_DEMO_MODE=true` únicamente en el entorno Preview. No usar demo en Production. El POS aún conserva módulos que no han terminado su migración transaccional a Supabase; consulta la guía antes de habilitar usuarios reales.
