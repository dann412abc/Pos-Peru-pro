# Mi Carrito POS 1.14.0
Etapa 14 — inventario de variantes por sucursal.

- Saldos independientes por variante/sucursal.
- Ajustes de entrada y salida con bloqueo transaccional y auditoría.
- Integración opcional con lotes de inventario.
- Idempotencia para evitar duplicar ajustes por reintentos.
- Endpoints de consulta y ajuste protegidos.
- Migración TypeORM preparada; no ejecutada.
- Ventas, devoluciones y anulaciones existentes no se modificaron y todavía no descuentan stock de variante.
- No se modificó Supabase remoto.
- Pruebas unitarias nuevas añadidas; ejecución integral y build del backend pendientes por dependencias no instaladas.
