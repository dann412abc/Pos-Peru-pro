# Mi Carrito POS v1.44.15

## Recepción de compras conectada a Supabase + Cloudflare

- La pantalla Compras llama a `recibirCompraSupabase()` cuando `VITE_AUTH_PROVIDER=supabase`; en modo backend tradicional conserva el endpoint NestJS.
- El payload incluye sucursal, proveedor, documento, condición y vencimiento, productos/variantes, empaques, costo unitario, IGV, lote, fecha de vencimiento y pagos.
- Se agrega estado de envío para impedir doble clic mientras se procesa la recepción.
- La clave idempotente se conserva al reintentar tras un error de red y se renueva después de una confirmación exitosa o al abrir una compra nueva.
- La UI solo muestra éxito si el servidor devuelve un identificador de compra y no reporta `ok:false`.
- Se añadieron pruebas de contrato para conexión de UI, bloqueo de doble envío, reintento idempotente y confirmación de respuesta.
- Si falta la migración SQL, Cloudflare responde con conflicto explícito; la compra no se presenta como registrada.

## Estado real del módulo Compras

La recepción nueva ya está conectada en el frontend cuando el proveedor de autenticación es Supabase. El historial/listado, detalle, devoluciones al proveedor, pagos posteriores de cuentas por pagar, anulación, órdenes de compra, análisis y alertas continúan usando endpoints NestJS. Por tanto, **el módulo Compras completo todavía no está migrado** y no debe anunciarse como listo para operar sin backend.

## Validación local

- 16 pruebas Node de contratos/endpoints/SQL preview: aprobadas.
- Transpilación sintáctica TypeScript/JSX: sin diagnósticos.
- Build Vite/TypeScript integral: no ejecutado porque esta copia no incluye `node_modules`.

## Seguridad y despliegue

- La migración `202611070008_purchase_receive_rpc.sql` continúa en preview y no fue ejecutada.
- No se modificó Supabase remoto ni se desplegó Cloudflare.
- Requiere probar el esquema real de staging antes de habilitar `VITE_AUTH_PROVIDER=supabase` para compras.
