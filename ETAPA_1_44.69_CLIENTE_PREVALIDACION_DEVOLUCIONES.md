# Etapa 1.44.69 — Cliente de prevalidación

Se conecta el cliente frontend con el RPC autenticado de prevalidación por medio de la ruta genérica Cloudflare `/api/edge/rpc/:name`.

La función cliente:
- exige sesión Supabase;
- valida el formato mínimo del payload;
- transmite `p_comprobante_id` y `p_payload`;
- acepta solo una respuesta `ok` que declare expresamente que no se registró ni modificó información.

No se conecta todavía al botón Registrar. La operación definitiva requiere una única transacción SQL que abarque devolución, pagos, caja, inventario/lotes y cuenta por cobrar. No habilitar escritura por permitir esta prevalidación.
