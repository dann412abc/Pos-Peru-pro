# Etapa 1.44.62 — Ciclo transaccional de caja

## RPCs
- `pos_caja_abrir_auth(p_sucursal_id,p_saldo_inicial)`
- `pos_caja_movimiento_auth(p_caja_id,p_tipo,p_metodo,p_monto,p_motivo)`
- `pos_caja_cerrar_auth(p_caja_id,p_efectivo_contado,p_arqueo)`

## Edge
- `POST /api/edge/cash/open`
- `POST /api/edge/cash/movement`
- `POST /api/edge/cash/close`

Todas requieren Bearer Supabase. SQL resuelve identidad con `auth.uid()` y comprueba usuario activo, empresa, sucursal asignada y propiedad de caja. Las operaciones bloquean la fila de caja para serializar movimientos/cierre.

## Instalación
Preview: `supabase/migrations-preview/202611070043_cash_register_lifecycle_auth.sql`.
No ejecutar en producción. Primero revisar el esquema en staging, aplicar allí y realizar pruebas concurrentes y de integración. La interfaz de CierreCaja aún no está conectada a estos endpoints; ese es el siguiente trabajo.
