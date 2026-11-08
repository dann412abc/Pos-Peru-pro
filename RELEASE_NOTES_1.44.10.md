# Mi Carrito POS v1.44.10

## Clientes y proveedores en Supabase + Cloudflare

- La pantalla Clientes usa `mutateSupabaseParty` para crear, editar y desactivar clientes cuando `VITE_AUTH_PROVIDER=supabase`.
- La desactivación conserva el historial y respeta las protecciones de Consumidor Final y saldo pendiente definidas en la RPC SQL.
- La pantalla Compras obtiene el listado de proveedores desde el catálogo Supabase y usa la RPC de terceros para alta, edición y desactivación.
- La consulta del catálogo incluye proveedores activos y excluye clientes desactivados.
- El formulario de clientes oculta email en modo Supabase porque la tabla `cliente` actual no persiste ese dato.
- Las operaciones de compras, órdenes, cuentas por pagar, caja y análisis siguen en el backend anterior; esta versión migra solamente el mantenimiento de clientes/proveedores.

## Migraciones

Requiere aplicar primero los previews previos de identidad, catálogo y `202611070006_parties_write_rpc.sql` en un entorno de staging. `202611070003_catalog_read_rpc.sql` actualizado incorpora proveedores y filtra clientes inactivos. No se ejecutó ninguna migración desde esta entrega.

## Validación

Se validan sintaxis/transpilación de archivos frontend, sintaxis de la función Cloudflare, estructura e integridad del ZIP. No se ejecutó build integral ni pruebas contra un proyecto Supabase real. No se desplegó Cloudflare.
