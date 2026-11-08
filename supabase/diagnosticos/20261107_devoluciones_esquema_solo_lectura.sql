-- DIAGNÓSTICO DE SOLO LECTURA — Etapa 1.44.71
-- Ejecutar en Supabase SQL Editor únicamente para inspeccionar el esquema.
-- No contiene CREATE/ALTER/INSERT/UPDATE/DELETE ni cambia datos.
WITH target_tables(table_name) AS (
  VALUES
   ('comprobante'),('comprobante_linea'),('comprobante_pago'),
   ('devolucion_venta'),('devolucion_venta_linea'),('devolucion_venta_pago'),('devolucion_venta_lote'),
   ('caja'),('caja_movimiento'),('producto_stock'),('producto_variante_stock'),
   ('inventario_lote'),('comprobante_lote_salida'),('movimiento_inventario'),
   ('cuenta_cobrar'),('cliente'),('usuario'),('usuario_sucursal')
),
table_info AS (
 SELECT t.table_name,
   EXISTS(SELECT 1 FROM information_schema.tables x
          WHERE x.table_schema='public' AND x.table_name=t.table_name) AS exists,
   COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'column',c.column_name,'type',c.data_type,'udt',c.udt_name,
       'nullable',c.is_nullable='YES','default',c.column_default,
       'precision',c.numeric_precision,'scale',c.numeric_scale
     ) ORDER BY c.ordinal_position)
     FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.table_name=t.table_name
   ),'[]'::jsonb) AS columns
 FROM target_tables t
),
constraints_info AS (
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'table',con.relname,'name',co.conname,
   'type',CASE co.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
     WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUSION' ELSE co.contype::text END,
   'definition',pg_get_constraintdef(co.oid,true)
 ) ORDER BY con.relname,co.conname),'[]'::jsonb) AS items
 FROM pg_constraint co
 JOIN pg_class con ON con.oid=co.conrelid
 JOIN pg_namespace ns ON ns.oid=con.relnamespace
 WHERE ns.nspname='public' AND con.relname IN (SELECT table_name FROM target_tables)
),
indexes_info AS (
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'table',t.relname,'name',i.relname,'definition',pg_get_indexdef(i.oid)
 ) ORDER BY t.relname,i.relname),'[]'::jsonb) AS items
 FROM pg_index ix
 JOIN pg_class t ON t.oid=ix.indrelid
 JOIN pg_class i ON i.oid=ix.indexrelid
 JOIN pg_namespace ns ON ns.oid=t.relnamespace
 WHERE ns.nspname='public' AND t.relname IN (SELECT table_name FROM target_tables)
),
policies_info AS (
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'table',p.tablename,'name',p.policyname,'command',p.cmd,
   'roles',p.roles,'using',p.qual,'check',p.with_check
 ) ORDER BY p.tablename,p.policyname),'[]'::jsonb) AS items
 FROM pg_policies p
 WHERE p.schemaname='public' AND p.tablename IN (SELECT table_name FROM target_tables)
)
SELECT jsonb_pretty(jsonb_build_object(
 'diagnostico','Mi Carrito POS — devoluciones — solo lectura',
 'schema','public',
 'tablas',(SELECT jsonb_agg(to_jsonb(ti) ORDER BY ti.table_name) FROM table_info ti),
 'restricciones',(SELECT items FROM constraints_info),
 'indices',(SELECT items FROM indexes_info),
 'politicasRLS',(SELECT items FROM policies_info),
 'nota','Compartir el resultado para contrastar columnas, tipos, claves foráneas, índices únicos y RLS antes de diseñar el RPC de registro.'
)) AS diagnostico_esquema_devoluciones;
