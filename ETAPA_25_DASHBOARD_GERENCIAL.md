# Etapa 25 — Dashboard gerencial avanzado

## Objetivo
Sustituir el dashboard local de demostración por indicadores gerenciales servidos desde el backend, con aislamiento por empresa y sucursal.

## Implementado
- Nuevo endpoint protegido `GET /api/gastos/reportes/dashboard-gerencial` (rol ADMIN), con filtro opcional `sucursalId` validado contra las sucursales autorizadas.
- Ventas del día, cantidad de comprobantes, ventas del mes y mes anterior, y variación porcentual cuando existe base comparable.
- Utilidad bruta y utilidad operativa parcial del día, reutilizando el cálculo del estado de resultados de la etapa 24.
- Top 8 de productos por unidades vendidas en los últimos 30 días, con ventas netas y utilidad bruta estimada por costo snapshot.
- Alertas de stock igual o inferior al mínimo por sucursal.
- Lotes con saldo y vencimiento dentro de los próximos 30 días.
- Productos con stock positivo y sin venta en los últimos 30 días.
- Comparación de ventas netas emitidas por sucursal para el mes actual cuando se consulta el conjunto de sucursales autorizadas.
- Interfaz responsive con estados de carga, error y listas vacías. El panel gerencial avanzado se reserva al administrador; el modo demo no presenta cifras ficticias como si fueran datos reales.

## Consideraciones y límites
- Los importes de venta del periodo se calculan desde comprobantes no anulados e incluyen IGV; las notas de crédito se restan y las notas de débito se suman.
- La utilidad bruta y operativa se calculan sin IGV sobre las líneas con costo registrado. Las líneas sin costo se informan por separado y no se consideran utilidad.
- La utilidad operativa es parcial: usa gastos registrados por fecha del gasto y no incluye depreciación, intereses, impuesto a la renta, provisiones ni ajustes contables.
- La consulta de alertas de stock usa `producto_stock`; las alertas de vencimiento usan `inventario_lote`. La clasificación de baja rotación se basa en ventas de comprobantes tipo factura/boleta en la sucursal consultada.
- El top de productos considera factura/boleta y descuenta devoluciones registradas. No se presenta como ranking contable auditado.
- La comparación entre sucursales se muestra cuando el endpoint consulta todas las sucursales autorizadas; la pantalla actual solicita la sucursal activa.
- La rentabilidad por variante/presentación no se desglosa en este dashboard; se conserva agrupada por producto padre donde la relación de ventas lo permite.

## Dependencias
- Requiere las tablas y columnas de las etapas anteriores, incluida `gasto_operativo` creada por la migración de la etapa 23. Si esa migración aún no se ejecutó, el endpoint puede fallar al reutilizar el estado de resultados.
- No agrega ni modifica migraciones SQL.

## Seguridad
- El controlador de gastos ya está protegido por JWT, RolesGuard y rol ADMIN.
- El endpoint filtra por `empresaId` y por las sucursales del token; si se solicita una sucursal concreta, verifica su pertenencia y autorización.

## Validación realizada
- Revisión estática de consultas, rutas, imports y tipos de respuesta.
- No se ejecutaron pruebas de integración contra PostgreSQL ni build completo porque no se instalaron dependencias (`node_modules` ausente en el ZIP base).
- No se ejecutó ninguna migración, no se modificó Supabase remoto y no se desplegó Cloudflare.
