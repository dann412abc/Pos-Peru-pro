# Bloque de ajustes de inventario con lotes — 1.44.79

## Alcance implementado en rama

Rama: `work/returns-register-1.44.79`.

Se agregó la migración preview `202611090007_inventory_adjustments_lots_auth.sql` y su prueba estática.

### Contrato de la RPC

`pos_inventario_ajustar_lote_auth(p_payload jsonb)`:

- Exige sesión Supabase, usuario POS activo, rol ADMIN y acceso a la sucursal.
- Valida producto, variante, tipo, cantidad a 3 decimales, motivo y clave de idempotencia.
- Actualiza el saldo agregado de producto o variante y el libro de lotes en una sola transacción.
- ENTRADA crea un lote de regularización sin vencimiento y conserva el costo promedio actual.
- SALIDA consume lotes por FEFO (vencimiento, fecha de creación e ID), con bloqueo de filas.
- Rechaza el movimiento si el saldo agregado no tiene lotes suficientes; no inventa trazabilidad.
- Registra el movimiento de inventario con `variante_id` cuando corresponde.
- Rechaza la reutilización de una clave con datos distintos y devuelve la respuesta original en reintentos idénticos.
- Revoca al cliente autenticado el acceso a la RPC antigua `pos_ajustar_inventario`, que no actualizaba lotes.

### Integración de aplicación

- Se añadió `frontend/src/api/supabaseInventory.ts`.
- Se añadió `POST /api/edge/inventory/adjust` en Cloudflare, con validación de payload y Bearer token.
- La pantalla Productos utiliza la nueva ruta para ajustes de productos y variantes cuando `VITE_AUTH_PROVIDER=supabase`.
- El flujo no declara éxito si Supabase no confirma `ok=true` y `trazabilidadLotes=true`.
- Se añadieron pruebas estáticas para la migración y el contrato Edge/cliente.

## Estado de validación

- Revisiones estáticas manuales del contenido: 9 comprobaciones PASS.
- Pruebas Node: **no ejecutadas**.
- Compilación TypeScript/Vite: **no ejecutada**.
- Compilación SQL/PLpgSQL: **no ejecutada**.
- Migración aplicada en staging o producción: **no**.
- Prueba funcional con sesión real: **pendiente**.

No aplicar esta migración en producción. Requiere primero instalar la migración preview 002 y validar el conjunto en una base de pruebas.

## Próximo bloque de integración

1. Transferencias entre sucursales de producto y variante, moviendo lotes y conservando vencimiento/costo.
2. Mermas conectadas a Supabase Edge y su RPC transaccional.
3. Conteo físico conectado a Supabase, con aplicación de diferencias sobre lotes.
4. Prueba integral de compra → lote → ajuste/transferencia/merma/conteo → venta → caja → devolución.
