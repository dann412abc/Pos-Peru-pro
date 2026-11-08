# Mi Carrito POS 1.44.69

## Cliente de prevalidación Supabase

- Añade `preflightSupabaseReturn()` en `frontend/src/api/supabaseReturns.ts`.
- Valida comprobante, motivo, clave de idempotencia y líneas antes de enviar.
- Llama al RPC autenticado `pos_devolucion_prevalidar_auth` mediante Cloudflare Edge.
- Rechaza respuestas que no confirmen explícitamente que fue una operación sin escritura.
- No habilita el registro definitivo ni modifica el flujo protegido de devoluciones.

La lista de RPC permitidos en Cloudflare debe incluir `pos_devolucion_prevalidar_auth` solo después de aplicar y validar la migración en un entorno de pruebas.
