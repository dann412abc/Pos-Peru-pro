# Etapa 29 — Control avanzado de proveedores

## Objetivo
Dar visibilidad de compras, devoluciones, cumplimiento de órdenes e historial de costos para apoyar la selección y negociación con proveedores.

## Implementado
- Endpoint administrativo `GET /api/compras/proveedores/analisis`, filtrado por sucursal y aislado por empresa.
- Resumen por proveedor: cantidad de compras recibidas, importe comprado, saldo pendiente, devoluciones, importe devuelto y fecha de última compra.
- Indicador de órdenes completas recibidas a tiempo, comparando la última recepción registrada con la fecha esperada. Solo se consideran órdenes recibidas completas con fecha esperada informada; órdenes parciales no se cuentan como entregas a tiempo.
- Historial de hasta cinco costos unitarios recientes por producto/presentación y proveedor.
- Comparación del último costo registrado por cada proveedor para cada producto/presentación, señalando el menor costo.
- Nueva pestaña «Análisis de proveedores» con tablas de desempeño, comparación de costos e historial.
- Los importes se calculan por separado en CTE para evitar duplicar totales por cruces entre compras, devoluciones y órdenes.

## Criterios y límites
- La comparación utiliza el costo unitario guardado en cada línea de compra recibida. No incorpora flete, descuentos externos, bonificaciones, plazo de crédito ni evaluación cualitativa.
- El proveedor con menor costo no necesariamente es la mejor opción comercial; se muestra como referencia de precio, no como recomendación automática.
- El cumplimiento de entrega solo puede calcularse cuando existe fecha esperada y recepción registrada. No se infiere cumplimiento de órdenes antiguas sin fecha esperada.
- No se ha agregado un módulo de incidencias de calidad: requiere definir un flujo operativo de evidencias, severidad, responsables y resolución antes de guardar datos de evaluación subjetiva.
- Los datos mostrados dependen de las migraciones previas de compras, variantes, devoluciones y órdenes de compra ya aplicadas en la base de datos.

## Seguridad
- Endpoint protegido por JWT, roles y rol ADMIN.
- Las consultas limitan datos a `empresa_id` y a las sucursales asignadas al usuario.
- No se modifican datos históricos ni inventario.

## Migraciones y despliegue
- No se agrega migración en esta etapa.
- No se ejecutó SQL ni se modificó Supabase.
- No se desplegó Cloudflare.

## Validación realizada
- Revisión estática de consultas y de los filtros de empresa/sucursal.
- Validación de sintaxis TypeScript/TSX en los archivos modificados.
- Integridad del ZIP comprobada.
- No se ejecutaron pruebas de integración PostgreSQL, build completo ni pruebas de navegador.
