# Etapa 20 — Reportes avanzados de inventario (v1.20.0)

## Implementado

- Endpoint `GET /api/inventario/reportes/stock-valorizado`: consolida productos únicos y variantes por sucursal autorizada, muestra stock, mínimo, costo promedio y valorización.
- Endpoint `GET /api/inventario/reportes/kardex/:productoId`: consulta movimientos por producto o variante, con filtro de fechas y límite de 2.000 filas.
- Validación de acceso a sucursales y de identificadores/fechas en backend.
- Pantalla Reportes: tabla de inventario valorizado, indicadores agregados, alerta de stock bajo mínimo y consulta de Kardex.
- Se reutilizan las tablas y columnas ya introducidas en migraciones anteriores; no se agrega migración en esta etapa.

## Criterios y límites

- La valorización usa el costo promedio vigente del saldo de cada sucursal, no reconstruye un valor histórico a una fecha pasada.
- El campo IGV referencial es solo informativo y no debe interpretarse como impuesto calculado para una operación tributaria.
- El Kardex muestra movimientos de inventario registrados; no reemplaza el libro contable ni los registros oficiales SUNAT.
- La interfaz requiere que el usuario tenga sucursal asignada. El Kardex se consulta por ID de producto y, si corresponde, ID de variante.
- No se ejecutaron migraciones, no se modificó Supabase remoto y no se desplegó Cloudflare.
