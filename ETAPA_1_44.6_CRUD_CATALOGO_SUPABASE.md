# Etapa 1.44.6 — CRUD de catálogo en Supabase + Cloudflare

- Se añade `POST /api/edge/catalog/mutate`, exige Bearer Supabase y acepta únicamente seis acciones explícitas.
- Se añade `mutateSupabaseCatalog()` al cliente frontend.
- Se añade SQL preview `supabase/migrations-preview/202611070004_catalog_write_rpc.sql` para altas, edición y baja lógica de productos y categorías.
- La función deriva usuario y empresa desde `auth.uid()` y no acepta `empresa_id` ni `usuario_id` del navegador.
- No se ejecuta la migración y no se activa el CRUD en pantallas hasta probar el esquema real en staging.
- Stock inicial y ajustes de inventario quedan fuera de este RPC: requieren movimientos de inventario auditables, no edición directa de saldo.
- Las variantes y sus códigos quedan para la siguiente subetapa, para no omitir validaciones de unicidad/stock.
