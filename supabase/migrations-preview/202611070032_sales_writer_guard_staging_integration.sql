-- v1.44.47 | Prueba de integración PostgreSQL para la barrera fail-closed.
-- SOLO staging aislado y sin escrituras concurrentes. NO es una migración.
-- Requiere psql y variables: auth_user_id (UUID real autorizado), sale_payload
-- (JSON válido con sucursal/cliente/producto/pagos existentes en ese staging).
-- Ejecutar conectado como postgres/propietario capaz de SET ROLE authenticated.
\set ON_ERROR_STOP on
\if :{?auth_user_id}
\else
  \echo 'Falta -v auth_user_id=<UUID de auth.users>'
  \quit 2
\endif
\if :{?sale_payload}
\else
  \echo 'Falta -v sale_payload=<JSON de venta válido para el staging>'
  \quit 2
\endif

BEGIN ISOLATION LEVEL REPEATABLE READ;

CREATE TEMP TABLE _sales_guard_snapshot (
  phase text NOT NULL,
  table_name text NOT NULL,
  row_count bigint NOT NULL,
  content_hash text NOT NULL,
  PRIMARY KEY (phase, table_name)
) ON COMMIT DROP;

DO $snapshot$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'comprobante', 'comprobante_linea', 'comprobante_pago',
    'movimiento_inventario', 'comprobante_lote_salida', 'cuenta_cobrar',
    'caja_movimiento', 'producto_stock', 'producto_variante_stock',
    'serie_correlativo'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'STAGING_SCHEMA_MISSING_TABLE: %', v_table;
    END IF;
    EXECUTE format(
      'INSERT INTO _sales_guard_snapshot(phase, table_name, row_count, content_hash) '
      'SELECT ''before'', %L, count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E''\n'' ORDER BY to_jsonb(t)::text), '''')) FROM public.%I t',
      v_table, v_table
    );
  END LOOP;
END;
$snapshot$;

-- Supabase auth.uid() consume el claim JWT. No se usa identidad del payload.
SELECT set_config('request.jwt.claim.sub', :'auth_user_id', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'auth_user_id', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.pos_venta_transaccion_guardia_auth(:'sale_payload'::jsonb) AS guard_result \gset
RESET ROLE;

CREATE TEMP TABLE _sales_guard_result AS
SELECT :'guard_result'::jsonb AS result;

DO $assert_guard$
DECLARE
  v_result jsonb;
BEGIN
  SELECT result INTO v_result FROM _sales_guard_result;
  IF COALESCE((v_result->>'ok')::boolean, true) IS DISTINCT FROM false
     OR v_result->>'decision' IS DISTINCT FROM 'WRITER_DISABLED'
     OR v_result->>'code' IS DISTINCT FROM 'SALE_TRANSACTIONAL_WRITER_NOT_READY'
     OR COALESCE((v_result->>'saleCreated')::boolean, true)
     OR COALESCE((v_result->>'paymentsCreated')::boolean, true)
     OR COALESCE((v_result->>'inventoryChanged')::boolean, true)
     OR COALESCE((v_result->>'cashMovementCreated')::boolean, true)
     OR COALESCE((v_result->>'receivableCreated')::boolean, true)
     OR COALESCE((v_result->>'correlativoConsumed')::boolean, true) THEN
    RAISE EXCEPTION 'WRITER_GUARD_RESULT_INVALID: %', v_result;
  END IF;
END;
$assert_guard$;

DO $snapshot$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'comprobante', 'comprobante_linea', 'comprobante_pago',
    'movimiento_inventario', 'comprobante_lote_salida', 'cuenta_cobrar',
    'caja_movimiento', 'producto_stock', 'producto_variante_stock',
    'serie_correlativo'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'INSERT INTO _sales_guard_snapshot(phase, table_name, row_count, content_hash) '
      'SELECT ''after'', %L, count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E''\n'' ORDER BY to_jsonb(t)::text), '''')) FROM public.%I t',
      v_table, v_table
    );
  END LOOP;
END;
$snapshot$;

DO $assert_unchanged$
DECLARE
  v_changed text;
BEGIN
  SELECT string_agg(b.table_name, ', ' ORDER BY b.table_name)
    INTO v_changed
  FROM _sales_guard_snapshot b
  JOIN _sales_guard_snapshot a USING (table_name)
  WHERE b.phase = 'before' AND a.phase = 'after'
    AND (b.row_count, b.content_hash) IS DISTINCT FROM (a.row_count, a.content_hash);
  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION 'WRITER_GUARD_CHANGED_OPERATIONAL_TABLES: %', v_changed;
  END IF;
END;
$assert_unchanged$;

SELECT 'PASS' AS integration_test,
       'WRITER_DISABLED; 10 tablas operativas sin cambios' AS detail;
ROLLBACK;
