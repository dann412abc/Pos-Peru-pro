# Integración frontend POS con la RPC transaccional — v1.44.53

## Flujo

1. El cajero valida carrito, caja, documento y medios de pago en la interfaz.
2. El frontend crea una huella del contenido del cobro y obtiene una clave de idempotencia estable por usuario/sucursal.
3. Se invoca `POST /api/edge/rpc/pos_venta_crear_auth` con `{ "p_payload": ... }` y el Bearer de Supabase.
4. Cloudflare Pages Functions reenvía la llamada a PostgREST con la clave anon y el JWT del usuario. No usa `service_role`.
5. La RPC deriva identidad, empresa, sucursal, caja, precios e IGV en servidor y confirma la transacción.
6. El frontend exige `ok=true`, ID de comprobante, serie y correlativo antes de registrar el ticket local y vaciar el carrito.
7. Ante error o respuesta ambigua, no vacía el carrito, no actualiza stock local y no manda la venta a NestJS ni a la cola offline. La misma huella reutiliza la clave para replay seguro.

## Variables necesarias (solo staging, no se configuraron)

Cloudflare Pages:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_RPC_ALLOWLIST=pos_venta_crear_auth` (solo cuando la RPC haya sido aprobada en staging)

Frontend:
- `VITE_AUTH_PROVIDER=supabase`
- `VITE_SUPABASE_SALES_ENABLED=true` (mantener `false` hasta pasar todas las validaciones)

La allowlist de Cloudflare es una defensa adicional; la función también valida `auth.uid()` y sus permisos. No agregar `service_role` al frontend ni a variables `VITE_*`.

## Condiciones previas obligatorias

- Aplicar manualmente el conjunto ordenado de migraciones preview en una base staging desechable, después de revisión SQL y backup.
- Confirmar que el usuario tiene una sucursal asignada, caja abierta y cliente existente.
- Confirmar que el cliente Consumidor Final `00000000` existe en la empresa. El frontend no crea ese registro automáticamente.
- Probar boleta y factura, pagos mixtos, crédito, variantes, FEFO, stock insuficiente, idempotencia y concurrencia.
- Revisar respuesta real de la RPC y datos persistidos antes de activar la bandera.

## Restricciones conocidas

- El orquestador SQL de esta versión exige `clienteId` existente. No crea clientes durante el cobro.
- Solo permite tipos `01` (factura) y `03` (boleta). La nota de venta sigue fuera de la RPC.
- Descuento global distinto de cero se rechaza. Los descuentos por línea requieren autorización y validación del servidor.
- Una llamada con respuesta de red ambigua conserva el carrito y la clave de idempotencia (guardada en `sessionStorage`, con clave determinista de respaldo si el navegador bloquea el almacenamiento). No se debe editar el carrito y reintentar con otra operación hasta verificar el estado de la venta; el endpoint de consulta de idempotencia aún requiere cerrar su integración de lectura en la interfaz.
- La bandera de activación está deshabilitada por defecto.


## Validación de esta entrega

La suite estática Node del repositorio pasó 111 pruebas y omitió 2 pruebas que requieren staging. Se verificó la sintaxis de los archivos TypeScript/TSX. El build Vite completo no se pudo validar porque `npm ci` agotó el tiempo disponible; no se incluye `node_modules` parcial.
