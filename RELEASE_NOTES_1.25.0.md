# Mi Carrito POS 1.25.0

## Novedades
- Dashboard gerencial conectado al backend para usuarios administradores.
- KPIs de ventas del día y del mes, comparación mensual y rentabilidad parcial.
- Top productos, alertas de inventario bajo, lotes próximos a vencer y productos sin movimiento.
- Comparación de ventas por sucursal disponible en el endpoint para usuarios con acceso a varias sucursales.

## Importante
- No se incluyen migraciones nuevas ni se ejecutaron migraciones existentes.
- El endpoint de dashboard reutiliza el estado de resultados de la etapa 24 y requiere que la migración de gastos de la etapa 23 esté aplicada.
- No se modificó el proyecto Supabase ni se realizó despliegue Cloudflare.
- Build completo e integración real pendientes de entorno con dependencias y base de datos.
