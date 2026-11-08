# Ventas Supabase — base de idempotencia v1.44.33

## Implementado

- Vista previa SQL `202611070019_sales_idempotency_preflight.sql`.
- Columna `comprobante.request_hash` para conservar la huella de la solicitud que una futura RPC de creación deberá guardar en la misma transacción que la venta.
- RPC `pos_venta_idempotencia_consultar_auth(jsonb)`: deriva empresa/usuario desde `auth.uid()`, valida sucursal asignada y compara la huella MD5 del JSONB sin `idempotencyKey`.
- Ruta Cloudflare `POST /api/edge/sales/idempotency-check`, con Bearer de Supabase, validación de tamaño/estructura y proxy con clave anon; no expone `service_role`.
- Pruebas de contrato para autenticación, payload inválido y forwarding.

## Límites importantes

Esta RPC es una **preconsulta**, no reserva la clave y no crea la venta. Dos solicitudes simultáneas pueden superar la preconsulta; la futura RPC de creación debe conservar el índice único `uq_comprobante_empresa_idempotency`, calcular y guardar `request_hash` dentro de la transacción, y ante conflicto recuperar la venta solo si la huella coincide. No se debe usar esta preconsulta como sustituto de esa protección transaccional.

Las ventas históricas con `request_hash IS NULL` devuelven error de revisión manual si se intenta reutilizar su clave. No se inventa una huella retrospectiva.

## No realizado

- No se creó todavía `pos_venta_crear_auth`.
- No se modificó el flujo de cobro ni se retiró la guardia Supabase.
- No se ejecutó SQL en Supabase ni se desplegó Cloudflare.
- No se verificó contra PostgreSQL real ni contra datos de staging.

## Próximo bloque

Implementar la RPC transaccional de creación de venta que persista la huella, valide caja/productos/variantes/IGV/pagos y actualice comprobante, inventario, lotes, crédito y caja de forma atómica. Después integrar la UI y probar concurrencia e idempotencia en staging.
