# Etapa 30 — Inventario inteligente

## Alcance
Se incorpora un análisis de inventario por sucursal que consolida productos simples y variantes. El análisis utiliza existencias actuales y comprobantes pagados de los últimos 90 días.

## Funciones
- Indicadores de valor del inventario, productos sin stock, stock bajo, sin rotación y sobrestock.
- Ventas de los últimos 30 y 90 días y fecha de la última venta.
- Cobertura estimada en días a partir del promedio diario de ventas de 30 días.
- Sugerencia de reposición para cubrir 30 días de demanda o alcanzar el stock mínimo, lo que sea mayor.
- Búsqueda por código/nombre, filtros por estado y exportación CSV.
- Alcance limitado a sucursales autorizadas del usuario; permite filtrar por la sucursal seleccionada.

## Criterios
- SIN_STOCK: existencia menor o igual a cero.
- STOCK_BAJO: existencia positiva o no, y menor o igual al stock mínimo (SIN_STOCK tiene prioridad).
- SIN_ROTACION: sin ventas en el periodo o última venta con más de 30 días.
- SOBRESTOCK: cobertura estimada superior a 60 días.
- SALUDABLE: los demás casos.
- La venta diaria es venta de unidades / 30. Si no hubo ventas, la cobertura no se calcula.
- La sugerencia es `max(stock mínimo, venta diaria × 30) - stock`, redondeada hacia arriba y nunca negativa.

## API
`GET /api/inventario/inteligencia?sucursalId={id}`

La respuesta contiene `resumen` e `items`. No se agregaron tablas ni migraciones.

## Consideraciones y límites
- El cálculo utiliza comprobantes con estado PAGADA y excluye tipos 07/08. No sustituye una conciliación de devoluciones, mermas o inventario físico.
- El análisis se basa en una ventana móvil de 30/90 días y puede verse afectado por estacionalidad, campañas o falta de historial.
- La sugerencia es orientativa: no crea órdenes de compra ni modifica stock.
- La clasificación de sobrestock requiere ventas recientes para estimar cobertura; productos sin ventas se clasifican como sin rotación.
- El valor de inventario usa costo promedio existente, no una tasación contable.

## Seguridad y despliegue
No se ejecutaron migraciones SQL, no se modificó Supabase y no se desplegó Cloudflare. No se realizaron operaciones sobre datos reales.

## Validación
Se revisó sintaxis de los archivos modificados y la integridad del ZIP. No se afirma prueba de integración PostgreSQL ni build completo, dado que el entorno de entrega no contiene `node_modules` ni conexión a la base.
