# Etapa 26 — Compras inteligentes y abastecimiento

## Objetivo
Ayudar a reponer inventario usando demanda histórica real, saldo por sucursal y costo promedio registrado.

## Implementado
- Endpoint autenticado `GET /api/compras/sugerencias-reposicion`.
- Aislamiento por empresa y validación de sucursales autorizadas.
- Demanda de 30 días calculada desde movimientos `SALIDA` vinculados a comprobantes; excluye transferencias y ajustes sin comprobante.
- Cobertura estimada en días y promedio diario de unidades vendidas.
- Cantidad sugerida para cubrir 14 días de demanda, respetando además el stock mínimo configurado.
- Estimación de inversión con el costo promedio del inventario.
- Identificación del último proveedor utilizado en compras recibidas para el producto/variante.
- Incluye productos base y variantes por sucursal.
- Nueva pestaña «Reposición sugerida» en Compras y proveedores, con prioridades, cantidades e inversión estimada.

## Criterios y límites
- 14 días es un parámetro inicial fijo: 7 días de abastecimiento y 7 de seguridad; debe configurarse según proveedor y zona.
- La demanda se basa en movimientos de inventario con comprobante asociado. No equivale a pronóstico estadístico ni considera estacionalidad, promociones, quiebres históricos o pedidos en tránsito.
- El último proveedor se muestra como referencia histórica, no como proveedor recomendado ni como orden automática.
- La cantidad sugerida es orientativa; el usuario debe revisar empaques, múltiplos de compra, vencimientos y condiciones comerciales.
- Si no hay ventas registradas en 30 días, el sistema solo recomienda cuando el stock está por debajo del mínimo.
- No se crea automáticamente una compra ni se registra pago.

## Seguridad y despliegue
- No se agregó migración.
- No se ejecutó SQL ni se modificó Supabase remoto.
- No se desplegó Cloudflare.
- La consulta limita los datos a `empresaId` y `sucursalIds` del usuario autenticado.

## Validaciones pendientes
- Ejecutar pruebas de integración contra PostgreSQL con datos de productos, variantes, movimientos y compras.
- Verificar rendimiento con inventarios grandes y revisar índices con `EXPLAIN ANALYZE`.
- Ejecutar build completo de frontend/backend en entorno con dependencias instaladas.
