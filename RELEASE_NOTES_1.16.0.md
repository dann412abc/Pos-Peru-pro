# Controla Ventas / Mi Carrito POS — v1.16.0

## Etapa 16: administración de variantes desde Productos

### Implementado
- Acceso a **Presentaciones y variantes** desde cada fila del catálogo de productos.
- Listado por producto con código interno, nombre de presentación, código de barras, precio, stock de la sucursal y estado.
- Alta y edición de variantes con código interno, código de barras opcional, nombre de presentación, precio de venta y precio mayorista.
- Activación y desactivación lógica de variantes; no se eliminan registros que pueden estar referenciados por ventas.
- Ajustes de entrada y salida de stock de una variante desde la interfaz, con motivo obligatorio y validación de cantidad hasta 3 decimales.
- La interfaz utiliza las API existentes de las etapas 13–15; no se añadió una ruta alternativa ni se cambió el contrato del backend.
- La solicitud de ajuste usa clave de idempotencia para evitar duplicar movimientos cuando se reintenta la misma operación.

### Seguridad y límites
- La gestión de variantes y movimientos está disponible desde la UI para usuarios ADMIN.
- La consulta de variantes sigue limitada a la sucursal asignada al usuario.
- El backend conserva las validaciones de empresa, sucursal, producto, variante y saldo; la UI no sustituye las validaciones del servidor.
- No se permite editar el stock directamente en el formulario del catálogo: se registra mediante movimientos auditables.
- Las variantes inactivas se muestran en el listado para permitir su reactivación y conservar trazabilidad; el backend impide vender variantes inactivas.

### Pendiente para etapas siguientes
- Recepción de compras/proveedores por variante y actualización de costo promedio por presentación.
- Transferencias entre sucursales por variante.
- Configuración de stock mínimo por variante y alertas específicas por presentación.
- Reportes de ventas, margen y rentabilidad por variante.
- Pruebas integrales de compilación y flujo real con una base de datos de pruebas.

### Operación
- No se ejecutaron migraciones.
- No se realizaron cambios en Supabase remoto.
- No se desplegó en Cloudflare.
