# Etapa 34 — Panel de control gerencial (v1.34.0)

## Objetivo
Ampliar el dashboard existente para reunir indicadores comerciales, financieros y operativos en una vista gerencial. No reemplaza la contabilidad ni modifica saldos.

## Entregado
- Se conserva el resumen existente de ventas del día/mes, rentabilidad gerencial, productos más vendidos, baja rotación, productos simples bajo mínimo, lotes por vencer y comparación por sucursal.
- Se agregan cuentas por cobrar: saldo abierto, cantidad de cuentas y saldo vencido.
- Se agregan cuentas por pagar a proveedores: saldo de compras recibidas, cantidad y vencido.
- Se agregan gastos pendientes y su importe vencido.
- Se agrega el número de cajas abiertas y el saldo inicial acumulado (no equivale al efectivo disponible actual).
- Se agrega costo de mermas de los últimos 30 días, unidades y número de registros. Se muestra aparte y no se resta nuevamente de la utilidad operativa.
- Se agrega alerta de stock mínimo para variantes.
- Se agregan tendencias de ventas de los últimos 7 días y 6 meses, usando fechas locales de Perú.
- El endpoint existente `GET /api/gastos/reportes/dashboard-gerencial` se amplía sin crear una ruta duplicada.

## Seguridad y alcance
- Conserva autenticación JWT, rol ADMIN, filtro por empresa y sucursales autorizadas.
- Los indicadores financieros consultan saldos vigentes; son lecturas y no crean ni actualizan cuentas.
- Se usa `America/Lima` para agrupar ventas por día/mes.
- La caja muestra sesiones abiertas y su saldo inicial agregado; no pretende calcular el efectivo actual de cada caja ni sustituye el cierre/arqueo.
- La utilidad es estimada y depende del costo registrado en las líneas; no es un estado financiero contable.

## Base de datos
No se añade migración. El panel utiliza las tablas creadas por etapas previas: `cuenta_cobrar`, `compra`, `gasto_operativo`, `inventario_merma`, `caja`, `producto_variante_stock` y las tablas de comprobantes e inventario.

**Importante:** las migraciones previas necesarias deben estar instaladas en el entorno antes de usar estos indicadores. No se ejecutó ninguna migración ni se modificó Supabase remoto durante esta etapa.

## Validaciones y pendientes
- Validación sintáctica TypeScript/TSX de archivos modificados.
- Integridad del ZIP de entrega.
- Pendiente: build completo con dependencias instaladas, pruebas de integración contra PostgreSQL real, revisión de permisos en el entorno y pruebas visuales en PC/Android.
