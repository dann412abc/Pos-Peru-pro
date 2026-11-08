# Checklist de puesta en marcha 1.43.1 (parche de auditoría)

## Supabase PostgreSQL
- [ ] Respaldo previo y entorno de prueba disponible.
- [ ] Inventariar el historial real de migraciones; ejecutar en orden y sin saltar dependencias.
- [ ] Comparar el historial de migraciones de la base real con los 23 archivos incluidos; aclarar el salto 0018 → 0020 (no hay archivo 0019).
- [ ] Confirmar que las migraciones 0020, 0021, 0022 y 0023 se aplican sin errores en staging.
- [ ] Definir e implementar RLS real o documentar y auditar la frontera exclusiva del backend; este paquete no crea políticas RLS.
- [ ] Verificar consultas de ventas, inventario, caja, gastos, notificaciones y facturación.

## Backend NestJS
- [ ] Node.js soportado, `npm ci`, `npm run build` y `npm test`.
- [ ] Definir JWT, DB SSL, CORS, OSE, SMTP/WhatsApp y `CRON_SECRET` en el proveedor seguro.
- [ ] Probar `/api/health` y `/api/docs` sin exponer credenciales.
- [ ] Redis/Bull disponible mientras FE continúe usando esta cola.

## Cloudflare
- [ ] Pages: root `frontend`, build `npm ci && npm run build`, output `dist`.
- [ ] Configurar `API_ORIGIN` como HTTPS del backend.
- [ ] Desplegar `cloudflare/alertas-cron` y configurar `POS_API_ORIGIN`/`CRON_SECRET`.
- [ ] Revisar logs del Worker y del backend.

## Aceptación de negocio
- [ ] Venta de boleta, factura y nota de venta/ticket interno según configuración.
- [ ] Pagos efectivo, tarjeta, Yape, Plin y crédito; caja y cierre.
- [ ] Devoluciones/anulaciones, stock, movimientos y arqueo.
- [ ] PC y Android, red inestable/offline y sincronización.
- [ ] Sustituir `MockNubefactAdapter` por un adaptador OSE/PSE real, configurar firma/certificado y confirmar homologación/recepción SUNAT antes de emitir legalmente.
- [ ] Sustituir `StubPdfService` por un generador de representación impresa completa antes de enviar PDFs reales.
