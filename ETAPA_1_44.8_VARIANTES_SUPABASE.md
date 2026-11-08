# Etapa 1.44.8 — Variantes y códigos de barras en Supabase

- Se añade RPC `pos_variante_mutar_auth` para crear, editar y desactivar presentaciones.
- La identidad y empresa se derivan de `auth.uid()`; el navegador no puede indicar empresa.
- Se validan códigos internos y de barras frente a productos y variantes de la empresa.
- El formulario de variantes usa Cloudflare Pages Functions cuando `VITE_AUTH_PROVIDER=supabase`.
- La lectura se obtiene del catálogo Supabase, incluye stock por variante y sucursal, y filtra por producto.
- El stock no se escribe desde el CRUD; sigue reservado a movimientos de inventario auditables.
- La reactivación de variantes queda deliberadamente deshabilitada en el flujo Supabase hasta contar con autorización administrativa específica.

## Pendiente de validar

La migración SQL es preliminar y requiere validar nombres/tipos contra el esquema real de staging. No se ejecutó SQL, no se modificó Supabase y no se desplegó Cloudflare. Build completo y pruebas contra Supabase quedan pendientes.
