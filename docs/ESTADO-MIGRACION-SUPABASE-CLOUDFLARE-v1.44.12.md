# Estado de migración — Mi Carrito POS v1.44.11

## Infraestructura objetivo
- Frontend estático: Cloudflare Pages.
- API incremental: Pages Functions / Cloudflare Workers.
- Identidad y datos: Supabase Auth + PostgreSQL mediante JWT del usuario.
- No se requiere VPS para los módulos que ya estén migrados y desplegados.

## Migrado en esta versión
- Autenticación Supabase (rutas Edge existentes; activación mediante `VITE_AUTH_PROVIDER=supabase`).
- Lectura del catálogo base, productos, clientes y proveedores mediante RPC de Supabase.
- Escritura de productos/categorías, variantes y terceros mediante RPCs con aislamiento por empresa derivada de `auth.uid()`.
- Formularios de Clientes y Proveedores conectados al endpoint `POST /api/edge/parties/mutate`.
- La ruta de terceros limita el cuerpo a 32 KB y convierte fallos de conexión con Supabase en una respuesta controlada 502.

## Aún depende del backend NestJS
- Registro y recepción de compras.
- Órdenes de compra, reposición sugerida y análisis histórico de proveedores.
- Cuentas por pagar y pagos a proveedores.
- Datos de productos/stock que consume la pantalla Compras, salvo la lista de proveedores.
- Otros módulos del POS no migrados a RPC/Edge.

## Migraciones SQL pendientes
Los archivos `supabase/migrations-preview/202611070001_*.sql` hasta `202611070006_*.sql` son propuestas para revisión. No se ejecutaron ni se aplicaron a ningún proyecto Supabase desde este trabajo.

## Despliegue y pruebas
No se desplegó Cloudflare, no se configuraron secretos remotos y no se ejecutaron operaciones en Supabase. La integración debe validarse primero en un proyecto de staging con las migraciones revisadas, pruebas de RLS/RPC y pruebas funcionales desde navegador móvil y PC.

## Actualización v1.44.12 — lectura segura de proveedores

- Se incorpora `GET /api/edge/parties/suppliers`, que requiere JWT Supabase y llama exclusivamente a `pos_proveedores_listar_auth()`.
- La RPC deriva la empresa desde `auth.uid()` y el vínculo `usuario.supabase_auth_user_id`; no acepta `empresa_id` del navegador.
- La pestaña Proveedores de Compras consume esta ruta dedicada tanto al entrar directamente como al recargar el módulo.
- La escritura de proveedores sigue usando `pos_terceros_mutar_auth()`.
- El registro de compras, recepción de órdenes, pagos, cuentas por pagar y movimientos de inventario continúan en NestJS. No activar escrituras de compras en Supabase hasta portar y probar la transacción integral.
- Migración SQL nueva en `supabase/migrations-preview/202611070007_suppliers_read_rpc.sql` (preview; no ejecutada).
