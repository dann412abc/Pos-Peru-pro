# Mi Carrito POS 1.44.68

## Prevalidación transaccional de devoluciones (Supabase)

- Añade `pos_devolucion_prevalidar_auth(p_comprobante_id, p_payload)`.
- Verifica sesión, usuario POS activo, sucursal autorizada, boleta/factura vigente y caja abierta.
- Bloquea comprobante, caja y líneas durante la prevalidación.
- Comprueba cantidades disponibles después de devoluciones anteriores.
- Valida crédito pendiente, total de reembolso, medios de pago, referencia Yape/Plin y efectivo disponible.
- No escribe devoluciones ni modifica inventario, caja o cuentas por cobrar.
- El registro definitivo sigue protegido hasta completar el RPC transaccional de commit.

## Migración

Vista previa: `supabase/migrations-preview/202611070047_returns_preflight_auth.sql`.

No ejecutar hasta revisar el esquema real en Supabase y validar la migración en staging.
