# Mi Carrito POS v1.44.33

- Se agrega la base de idempotencia para futuras ventas Supabase: huella de solicitud y RPC de preconsulta autenticada.
- Se agrega la ruta Cloudflare `sales/idempotency-check`.
- La ruta solo consulta; no crea ventas ni modifica inventario.
- El cobro Supabase continúa protegido hasta completar la RPC transaccional de creación.
- SQL en `supabase/migrations-preview/202611070019_sales_idempotency_preflight.sql`; preview solamente, no ejecutado.
