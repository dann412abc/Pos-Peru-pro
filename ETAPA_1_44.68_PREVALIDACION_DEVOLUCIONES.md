# Etapa 1.44.68 — Prevalidación segura de devoluciones

Esta etapa prepara el contrato transaccional antes de habilitar escrituras en Supabase.

## RPC
`public.pos_devolucion_prevalidar_auth(integer, jsonb)`

La función autentica con `auth.uid()`, vincula el usuario POS, comprueba sucursal y caja abierta, bloquea el comprobante/caja/líneas y valida cantidades, saldo de crédito, pagos y efectivo disponible.

## Seguridad e integridad
- `SECURITY DEFINER` con `search_path` fijo.
- Ejecución solo para `authenticated`; sin acceso `PUBLIC` ni `anon`.
- No registra devoluciones ni realiza cambios de stock, caja o cuentas por cobrar.
- Una clave de idempotencia ya existente se trata como conflicto y exige revisar historial; no se asume equivalencia de hash con el backend anterior.

## Pendiente para habilitar el botón Registrar
Implementar el RPC de commit que replique toda la transacción del backend: devolución, líneas, pagos, caja, inventario/lotes y cuenta por cobrar. Hasta entonces la interfaz de escritura Supabase permanece bloqueada.
