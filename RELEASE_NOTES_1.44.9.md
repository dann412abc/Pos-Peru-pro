# Mi Carrito POS v1.44.9

- Nueva ruta Edge para mutaciones de clientes y proveedores mediante Supabase RPC.
- Nuevo cliente frontend `supabaseParties.ts`.
- Nueva migración de vista previa `202611070006_parties_write_rpc.sql`.
- Baja lógica, aislamiento por empresa, protección de saldos y compras históricas.
- Sin ejecución remota de SQL ni despliegue.
- Build integral y pruebas reales de PostgreSQL/Supabase pendientes.
