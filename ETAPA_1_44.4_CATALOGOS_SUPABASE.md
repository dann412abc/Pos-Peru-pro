# Etapa 1.44.4 — Lectura de catálogos por Supabase + Cloudflare

## Incluido
- `GET /api/edge/catalog/base` en Cloudflare Pages Functions.
- Validación de Bearer token y parámetro opcional `sucursal_id`.
- Llamada con token del usuario a `pos_catalogo_base_auth`; no usa service-role.
- Cliente TypeScript `fetchSupabaseCatalog` para productos, categorías, variantes, existencias, clientes y sucursales.
- SQL preview de solo lectura con empresa/usuario/sucursal derivados de `auth.uid()` y `usuario_sucursal`.

## Límites y seguridad
- La función SQL es SECURITY DEFINER y por eso requiere revisión de esquema y pruebas en staging antes de ejecutar.
- Solo devuelve filas de la empresa vinculada y stock de una sucursal autorizada.
- Los clientes se limitan a 500 registros; se requiere paginación para catálogos mayores.
- Esta etapa no conecta aún pantallas existentes ni sustituye sus llamadas NestJS; no se debe activar el cambio de backend todavía.
- Requiere que existan `producto_variante`, `producto_stock` y `usuario.supabase_auth_user_id` con los nombres de columnas usados.

## Despliegue pendiente
Configurar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en Cloudflare Pages. Ejecutar `supabase/migrations-preview/202611070003_catalog_read_rpc.sql` únicamente en un proyecto staging después de verificar el esquema y probar aislamiento entre dos empresas.
