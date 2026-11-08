# Etapa 1.44.7 — Formularios de productos conectados a Supabase

## Alcance
- La pantalla Productos usa `mutateSupabaseCatalog()` cuando `VITE_AUTH_PROVIDER=supabase`.
- Crear y editar productos invocan `pos_catalogo_mutar_auth` mediante `/api/edge/catalog/mutate`.
- La categoría se resuelve contra el catálogo remoto; si no existe, se crea primero con el RPC de categorías y luego se crea el producto.
- El stock no se envía en el CRUD: permanece reservado a movimientos de inventario auditables.
- La desactivación usa `product_deactivate` (baja lógica), conservando el historial.
- El modo anterior NestJS y el modo demo se mantienen sin cambios cuando Supabase Auth no está activado.

## Configuración requerida
- `VITE_AUTH_PROVIDER=supabase`
- `SUPABASE_URL` y `SUPABASE_ANON_KEY` como variables de entorno de Cloudflare Pages.
- Instalar en staging, tras revisar el esquema real, `supabase/migrations-preview/202611070004_catalog_write_rpc.sql`.

## Límites conocidos
- La creación de una categoría nueva y la creación del producto son dos RPC separadas; si la segunda falla, la categoría queda creada y puede reutilizarse. No se pierde el producto ni se altera el stock.
- Las variantes y sus movimientos siguen usando el backend anterior; no se habilita su CRUD remoto en esta etapa.
- No se ejecutó SQL ni se desplegó Cloudflare.
