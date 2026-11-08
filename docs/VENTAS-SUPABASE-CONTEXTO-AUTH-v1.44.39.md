# Contexto autenticado de ventas — v1.44.39

## Alcance
Se agrega `public.pos_venta_contexto_auth(jsonb)` como primer bloque de la futura RPC de ventas.

La función:
- exige una sesión Supabase válida mediante `auth.uid()`;
- resuelve el usuario POS por `usuario.supabase_auth_user_id`, sin aceptar `usuarioId` ni `empresaId` del navegador;
- exige que el usuario esté activo;
- verifica que la sucursal pertenezca a su empresa y esté asignada en `usuario_sucursal`;
- localiza una caja `ABIERTA` perteneciente al usuario y sucursal;
- bloquea la fila de caja con `FOR UPDATE`, preparado para ser invocado dentro de la transacción principal.

## Límites deliberados
Esta función **no crea ventas**, no consume correlativos, no descuenta existencias, no registra pagos ni movimientos de caja. Devuelve `saleCreated: false`.

El bloqueo `FOR UPDATE` solo protege el flujo completo si esta función se integra dentro de la futura RPC transaccional principal. Una llamada directa e independiente libera el bloqueo al finalizar su propia transacción.

## Seguridad y despliegue
- `SECURITY DEFINER` con `search_path` fijo.
- Ejecución revocada a `PUBLIC` y concedida a `authenticated`.
- No ejecutar todavía en Supabase ni desplegar a producción.
- Antes de integrar el siguiente bloque, probar con usuarios activos/inactivos, sucursal propia/ajena, caja abierta/cerrada y dos ventas concurrentes.
