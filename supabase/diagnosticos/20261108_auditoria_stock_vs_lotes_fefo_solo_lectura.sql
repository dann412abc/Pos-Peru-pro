-- Auditoría de conciliación stock vs lotes FEFO
-- Solo lectura: no ejecuta INSERT, UPDATE, DELETE, DDL ni RPC.
-- Ejecutar únicamente en una sesión autorizada de diagnóstico.
-- Compara stock por sucursal de productos y variantes con inventario_lote.

WITH stock_saldos AS (
  SELECT
    ps.empresa_id,
    ps.sucursal_id,
    ps.producto_id,
    NULL::integer AS variante_id,
    ps.stock::numeric(12,3) AS stock_registrado
  FROM producto_stock ps

  UNION ALL

  SELECT
    pvs.empresa_id,
    pvs.sucursal_id,
    pvs.producto_id,
    pvs.variante_id,
    pvs.stock::numeric(12,3) AS stock_registrado
  FROM producto_variante_stock pvs
),
lotes AS (
  SELECT
    l.empresa_id,
    l.sucursal_id,
    l.producto_id,
    l.variante_id,
    SUM(l.cantidad_disponible)::numeric(12,3) AS lotes_total,
    SUM(
      CASE
        WHEN l.fecha_vencimiento IS NULL OR l.fecha_vencimiento >= CURRENT_DATE
          THEN l.cantidad_disponible
        ELSE 0
      END
    )::numeric(12,3) AS lotes_vigentes,
    SUM(
      CASE
        WHEN l.fecha_vencimiento < CURRENT_DATE
          THEN l.cantidad_disponible
        ELSE 0
      END
    )::numeric(12,3) AS lotes_vencidos,
    COUNT(*) FILTER (WHERE l.cantidad_disponible > 0)::integer AS cantidad_lotes_con_saldo
  FROM inventario_lote l
  WHERE l.cantidad_disponible > 0
  GROUP BY l.empresa_id, l.sucursal_id, l.producto_id, l.variante_id
),
conciliacion AS (
  SELECT
    COALESCE(s.empresa_id, l.empresa_id) AS empresa_id,
    COALESCE(s.sucursal_id, l.sucursal_id) AS sucursal_id,
    COALESCE(s.producto_id, l.producto_id) AS producto_id,
    COALESCE(s.variante_id, l.variante_id) AS variante_id,
    COALESCE(s.stock_registrado, 0)::numeric(12,3) AS stock_registrado,
    COALESCE(l.lotes_total, 0)::numeric(12,3) AS lotes_total,
    COALESCE(l.lotes_vigentes, 0)::numeric(12,3) AS lotes_vigentes,
    COALESCE(l.lotes_vencidos, 0)::numeric(12,3) AS lotes_vencidos,
    COALESCE(l.cantidad_lotes_con_saldo, 0) AS cantidad_lotes_con_saldo
  FROM stock_saldos s
  FULL OUTER JOIN lotes l
    ON l.empresa_id = s.empresa_id
   AND l.sucursal_id = s.sucursal_id
   AND l.producto_id = s.producto_id
   AND l.variante_id IS NOT DISTINCT FROM s.variante_id
)
SELECT
  empresa_id,
  sucursal_id,
  producto_id,
  variante_id,
  stock_registrado,
  lotes_total,
  lotes_vigentes,
  lotes_vencidos,
  cantidad_lotes_con_saldo,
  (stock_registrado - lotes_vigentes)::numeric(12,3) AS diferencia_stock_vs_lotes_vigentes,
  CASE
    WHEN lotes_vencidos > 0 AND stock_registrado > lotes_vigentes
      THEN 'STOCK_SIN_LOTES_VIGENTES_Y_LOTES_VENCIDOS'
    WHEN stock_registrado > lotes_vigentes
      THEN 'STOCK_SIN_LOTES_VIGENTES'
    WHEN lotes_total > stock_registrado
      THEN 'LOTES_SUPERAN_STOCK'
    WHEN lotes_vencidos > 0
      THEN 'EXISTEN_LOTES_VENCIDOS'
    ELSE 'CONCILIADO'
  END AS resultado
FROM conciliacion
WHERE stock_registrado <> lotes_vigentes
   OR lotes_vencidos > 0
ORDER BY empresa_id, sucursal_id, producto_id, variante_id NULLS FIRST;
