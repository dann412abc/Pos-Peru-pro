# Mi Carrito POS v1.44.7

- Conectado el formulario de alta/edición de productos con Supabase RPC cuando se activa Supabase Auth.
- Conectada la baja lógica de productos al RPC seguro.
- Resolución/creación de categoría asociada al producto.
- Se excluye el stock del CRUD para preservar movimientos auditables.
- Se conserva el comportamiento NestJS/demo cuando Supabase Auth no está activo.
- Pendiente: instalación y pruebas SQL en staging, build completo, variantes, clientes/proveedores y movimientos de inventario.
