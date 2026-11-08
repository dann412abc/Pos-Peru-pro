# Etapa 1.44.5 — Lectura de catálogos desde Supabase

## Implementado
- Productos: cuando `VITE_AUTH_PROVIDER=supabase`, la pantalla consulta `GET /api/edge/catalog/base` con el JWT actual y la sucursal activa.
- Clientes: en el mismo modo consulta el catálogo remoto, sin recurrir silenciosamente al backend NestJS.
- Normalización de columnas PostgreSQL `snake_case` y propiedades TypeScript `camelCase`.
- Stock agregado por producto desde filas de `producto_stock`.
- Caché local IndexedDB para facilitar la visualización posterior, sin convertirla en fuente de verdad.

## Límites deliberados
- Esta etapa es de lectura. Crear/editar productos y clientes, variantes, proveedores, ajustes y transferencias aún dependen de operaciones backend anteriores o requieren RPC transaccionales.
- El RPC `pos_catalogo_base_auth` debe estar instalado en un entorno de staging y probado con usuarios/sucursales reales antes de habilitar `VITE_AUTH_PROVIDER=supabase`.
- Verificar nombres de columnas contra el esquema instalado; los normalizadores aceptan alias conocidos, pero no sustituyen la validación de esquema.
- No ejecutar migraciones automáticamente ni activar el proveedor en producción.
