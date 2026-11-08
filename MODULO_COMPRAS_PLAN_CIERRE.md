# Cierre del módulo Compras — plan de aceptación

## Alcance del módulo
1. Proveedores: listado, alta, edición y baja lógica (Supabase en modo Supabase).
2. Recepción: compra, líneas, lotes, stock, costo promedio, pagos y caja (RPC Supabase preparada y UI conectada).
3. Historial: listado paginado y filtros por fecha, proveedor, documento y sucursal.
4. Detalle: líneas, pagos, lotes, movimientos y saldo.
5. Cuentas por pagar: consulta, abonos parciales, pago total y conciliación de caja/banco.
6. Devoluciones al proveedor: devolución parcial/total, reversión de stock/lote y aplicación a deuda/saldo a favor.
7. Anulación: reversión integral, solo si las cantidades y pagos permiten una anulación consistente; auditar motivo y usuario.
8. Órdenes y recepción parcial: mantener trazabilidad entre orden, recepciones y saldo pendiente.
9. Reportes: compras por periodo/proveedor/producto, costo y variación de precios.

## Criterios de aceptación obligatorios
- Toda operación monetaria o de inventario se realiza en RPC transaccional, con empresa y usuario derivados de `auth.uid()`.
- RLS y permisos impiden acceso cruzado entre empresas/sucursales.
- Claves idempotentes para recepción, pagos, devoluciones y anulaciones.
- Pruebas de rollback, concurrencia, variantes, lotes, vencimientos, IGV, pagos mixtos, crédito y caja.
- Validación de duplicidad de comprobante por proveedor/serie/número.
- No se retira NestJS hasta que todas las rutas y pruebas estén migradas y aprobadas.

## Pendiente de v1.44.15
Historial/detalle, pagos posteriores, devoluciones, anulaciones, órdenes, análisis y alertas siguen en NestJS. La recepción Supabase no se debe usar en producción hasta ejecutar y validar la migración en un proyecto staging con el esquema compatible.
