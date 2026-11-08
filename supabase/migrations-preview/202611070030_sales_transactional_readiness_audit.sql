-- v1.44.45 | AUDITORIA READ-ONLY PARA PREPARAR LA RPC TRANSACCIONAL DE VENTAS.
-- Ejecuta únicamente SELECT sobre catálogos del sistema PostgreSQL.
-- No crea/modifica objetos, no bloquea filas operativas y no registra ventas.
WITH required_columns(table_name, column_name) AS (
  VALUES
    ('comprobante','request_hash'),
    ('comprobante','idempotency_key'),
    ('comprobante','caja_id'),
    ('comprobante_pago','monto_recibido'),
    ('comprobante_pago','vuelto'),
    ('producto_stock','stock'),
    ('producto_stock','costo_promedio'),
    ('producto_variante_stock','stock'),
    ('producto_variante_stock','costo_promedio'),
    ('movimiento_inventario','variante_id'),
    ('movimiento_inventario','stock_anterior'),
    ('movimiento_inventario','stock_posterior'),
    ('inventario_lote','cantidad_disponible'),
    ('comprobante_lote_salida','variante_id'),
    ('cuenta_cobrar','saldo_pendiente'),
    ('cliente','saldo_credito')
), column_status AS (
  SELECT 'COLUMN'::text AS check_type,
         format('%I.%I', r.table_name, r.column_name) AS object_name,
         (c.column_name IS NOT NULL) AS present,
         CASE WHEN c.column_name IS NULL THEN 'Falta columna requerida' ELSE 'Columna disponible' END AS detail
  FROM required_columns r
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = r.table_name
   AND c.column_name = r.column_name
), required_indexes(index_name, purpose) AS (
  VALUES
    ('uq_comprobante_empresa_idempotency','Idempotencia única por empresa'),
    ('uq_caja_abierta_sucursal_usuario','Una caja abierta por usuario y sucursal'),
    ('uq_serie_correlativo_sucursal_tipo_serie','Correlativo único por sucursal/tipo/serie'),
    ('uq_comprobante_sucursal_tipo_serie_correlativo','Numeración única de comprobante')
), index_status AS (
  SELECT 'INDEX'::text AS check_type,
         r.index_name AS object_name,
         (i.indexname IS NOT NULL) AS present,
         CASE WHEN i.indexname IS NULL THEN 'Índice requerido ausente' ELSE r.purpose || ': ' || i.indexdef END AS detail
  FROM required_indexes r
  LEFT JOIN pg_indexes i
    ON i.schemaname = 'public'
   AND i.indexname = r.index_name
), required_constraints(constraint_name, table_name, purpose) AS (
  VALUES
    ('comprobante_metodo_pago_check','comprobante','Método principal incluye MIXTO y medios permitidos'),
    ('comprobante_tipo_check','comprobante','Tipo de comprobante permitido'),
    ('comprobante_pago_metodo_pago_check','comprobante_pago','Medios de pago desglosados permitidos')
), constraint_status AS (
  SELECT 'CONSTRAINT'::text AS check_type,
         r.table_name || '.' || r.constraint_name AS object_name,
         (c.conname IS NOT NULL) AS present,
         CASE WHEN c.conname IS NULL THEN 'Restricción ausente o con nombre distinto; revisar definición' ELSE r.purpose || ': ' || pg_get_constraintdef(c.oid) END AS detail
  FROM required_constraints r
  LEFT JOIN pg_constraint c
    ON c.conname = r.constraint_name
   AND c.conrelid = to_regclass('public.' || r.table_name)
), all_checks AS (
  SELECT * FROM column_status
  UNION ALL SELECT * FROM index_status
  UNION ALL SELECT * FROM constraint_status
)
SELECT check_type, object_name, present, detail
FROM all_checks
ORDER BY present ASC, check_type, object_name;
