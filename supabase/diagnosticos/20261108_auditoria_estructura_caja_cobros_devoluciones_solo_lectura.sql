-- ETAPA 1.44.76 — AUDITORÍA ESTRUCTURAL CAJA / COBRANZAS / DEVOLUCIONES
-- SOLO LECTURA. No crea objetos, no cambia permisos y no modifica datos.
-- Ejecutar con usuario autenticado para revisar el contexto de RLS.
WITH target_tables(table_name) AS (
  VALUES ('caja'),('caja_movimiento'),('comprobante'),('comprobante_pago'),
         ('cobro_cliente'),('cuenta_cobrar'),('devolucion_venta'),('devolucion_venta_pago')
),
table_info AS (
  SELECT t.table_name,
    EXISTS (SELECT 1 FROM information_schema.tables x
            WHERE x.table_schema='public' AND x.table_name=t.table_name) AS exists,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'column',c.column_name,'type',c.data_type,'udt',c.udt_name,
        'nullable',c.is_nullable='YES','default',c.column_default
      ) ORDER BY c.ordinal_position)
      FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=t.table_name
    ),'[]'::jsonb) AS columns
  FROM target_tables t
),
constraints_info AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table',cl.relname,'name',co.conname,
    'type',CASE co.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
      WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' ELSE co.contype::text END,
    'definition',pg_get_constraintdef(co.oid,true)
  ) ORDER BY cl.relname,co.conname),'[]'::jsonb) AS items
  FROM pg_constraint co
  JOIN pg_class cl ON cl.oid=co.conrelid
  JOIN pg_namespace ns ON ns.oid=cl.relnamespace
  WHERE ns.nspname='public' AND cl.relname IN (SELECT table_name FROM target_tables)
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
),
triggers_info AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table',event_object_table,'name',trigger_name,'event',event_manipulation,
    'timing',action_timing,'orientation',action_orientation,'condition',action_condition,
    'statement',action_statement
  ) ORDER BY event_object_table,trigger_name,event_manipulation),'[]'::jsonb) AS items
  FROM information_schema.triggers
  WHERE trigger_schema='public' AND event_object_table IN (SELECT table_name FROM target_tables)
),
functions_info AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'function',p.proname,'signature',pg_get_function_identity_arguments(p.oid),
    'security_definer',p.prosecdef,'search_path',
      (SELECT string_agg(config.setting, ',') FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) AS config(setting) WHERE config.setting LIKE 'search_path=%'),
    'definition',pg_get_functiondef(p.oid)
  ) ORDER BY p.proname),'[]'::jsonb) AS items
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'pos_registrar_cobranza','pos_registrar_devolucion','pos_resumen_caja',
    'pos_cerrar_caja','pos_registrar_movimiento_caja','pos_caja_resumen_auth',
    'pos_caja_movimientos_listar_auth'
  )
)
SELECT jsonb_pretty(jsonb_build_object(
  'diagnostico','Auditoría estructural de caja, cobranzas y devoluciones — solo lectura',
  'fecha',now(),
  'tablas',(SELECT jsonb_agg(to_jsonb(ti) ORDER BY ti.table_name) FROM table_info ti),
  'restricciones',(SELECT items FROM constraints_info),
  'indices',(SELECT items FROM indexes_info),
  'politicasRLS',(SELECT items FROM policies_info),
  'triggers',(SELECT items FROM triggers_info),
  'funciones',(SELECT items FROM functions_info),
  'nota','No ejecuta INSERT, UPDATE, DELETE, DDL ni cambios de permisos. Revisar especialmente claves foráneas entre cobro_cliente/caja_movimiento y devolucion_venta_pago/devolucion_venta antes de implementar conciliación monetaria.'
)) AS auditoria_caja_cobros_devoluciones;
