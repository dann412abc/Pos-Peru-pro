# v1.44.13 — Contrato seguro para recepción de compras

## Alcance de esta entrega
- Añade `POST /api/edge/purchases/receive` en Cloudflare Pages Functions.
- Exige JWT Supabase, valida estructura, sucursal, proveedor, clave idempotente, cantidad de líneas/pagos y límite de tamaño.
- Reenvía la operación a `public.pos_compra_recibir_auth(p_payload jsonb)` usando la clave ANON y el JWT del usuario; nunca usa `service_role`.
- Añade `frontend/src/api/supabasePurchases.ts` con el contrato tipado de recepción.
- La ruta devuelve `409 PURCHASE_MIGRATION_REQUIRED` si la RPC no existe; no informa éxito ni activa escritura incompleta.

## Contrato esperado de la RPC
La función SQL deberá derivar `empresa_id` y `usuario_id` de `auth.uid()`, verificar asignación de sucursal y proveedor activo, validar productos/variantes y documentos duplicados, y realizar en una sola transacción: cabecera, líneas, stock, costo promedio ponderado, lotes, movimientos de inventario, pagos, movimientos de caja y saldo por pagar. Debe aplicar `idempotencyKey` de forma atómica y devolver la compra existente ante reintento con la misma clave.

## Estado explícito
Esta versión **no contiene aún la RPC SQL**, no conecta el botón de recepción de la pantalla Compras y no cambia el comportamiento de producción. El backend NestJS sigue siendo el receptor operativo. El siguiente paso es implementar y revisar la RPC con el esquema completo, incluidas reglas de caja, IGV, lotes y variantes; luego probar en staging antes de conectar la UI.

## Seguridad
No aceptar `empresa_id`, `usuario_id` ni permisos desde el cliente. La función SQL debe ser `SECURITY DEFINER` con `search_path` fijo, validar `auth.uid()` y revocar ejecución a `PUBLIC`/`anon`, otorgándola solo a `authenticated`.
