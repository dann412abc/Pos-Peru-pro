# Recuperación de ventas con respuesta ambigua — v1.44.54

## Objetivo

Resolver el caso en que el navegador envía una venta, Supabase la confirma, pero la respuesta se pierde por timeout, cierre de pestaña o interrupción de red. El POS debe poder consultar el comprobante usando la misma clave idempotente sin volver a descontar stock.

## Implementación

- La RPC `pos_venta_idempotencia_consultar_auth(p_payload)` se reemplaza por una versión de solo lectura.
- Deriva usuario y empresa desde `auth.uid()` y valida que la sucursal esté asignada al usuario.
- Calcula el mismo SHA-256 del payload sin `idempotencyKey`, igual que la RPC creadora.
- Si encuentra la clave y el hash coincide, devuelve ID, tipo, serie, correlativo, total, estado y desglose de pagos.
- Si no encuentra el comprobante, devuelve `NOT_FOUND_YET`. Esto NO prueba que la primera solicitud haya fallado: la transacción puede seguir en curso.
- No exige caja abierta, porque la consulta de recuperación no crea ni modifica ventas.
- No inserta ni actualiza tablas. No modifica stock, caja, correlativos, pagos ni crédito.
- El frontend solo consulta recuperación tras timeout, corte de red o respuesta 5xx de la creación.
- Si la consulta encuentra la venta, el adaptador devuelve confirmación al flujo de cobro y se registra el ticket local sin volver a crear.
- Si no encuentra una venta o la consulta falla, conserva carrito y clave. El siguiente reintento debe usar exactamente la misma clave; el advisory lock de la RPC creadora serializa solicitudes concurrentes.

## Ejecución segura

Esta migración queda en `supabase/migrations-preview/`. No se ejecutó en Supabase ni en Cloudflare. Requiere revisión SQL y staging antes de aplicarse.

La bandera `VITE_SUPABASE_SALES_ENABLED` sigue en `false`. No habilitar cobros hasta que:
1. Se revisen y apliquen las migraciones en un entorno de staging desechable.
2. Se prueben venta confirmada + respuesta perdida, venta aún en curso, clave reutilizada con payload distinto y sesión expirada.
3. Se confirme el desglose de pagos y el comprobante persistido.
4. Se valide el comportamiento de reintento con dos sesiones concurrentes.

## Interpretación de estados

- `SALE_CONFIRMED`: el comprobante existe y su huella coincide. Se puede recuperar su confirmación.
- `NOT_FOUND_YET`: no se observa un comprobante confirmado todavía. No informar al cajero que la venta definitivamente no existe; mantener carrito y clave.
- `IDEMPOTENCY_KEY_PAYLOAD_CONFLICT`: la clave existe con otro contenido. No reintentar con una clave nueva automáticamente; requiere intervención y auditoría.
- `SALE_STATUS_EXISTING_HASH_UNVERIFIABLE`: el registro existe, pero no tiene huella válida. Detener y revisar manualmente.

## Validación de esta entrega

Suite estática Node: 117 aprobadas, 0 fallidas y 2 omitidas por requerir staging. Se verificó la sintaxis TypeScript/TSX de los archivos modificados. No se ejecutó el build Vite ni una prueba runtime contra Supabase.
