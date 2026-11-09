import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations-preview/202611090006_sales_fefo_auth.sql','utf8');

test('migration is preview-only and requires the real sale and lot schema',()=>{
  assert.match(sql,/PREVIEW ONLY/);
  assert.match(sql,/SALE_FEFO_PREREQUISITES_MISSING/);
  assert.match(sql,/pos_registrar_venta\(jsonb\)/);
});

test('every FEFO allocation is linked to the exact comprobante line',()=>{
  assert.match(sql,/ADD COLUMN IF NOT EXISTS comprobante_linea_id integer/);
  assert.match(sql,/REFERENCES public\.comprobante_linea\(id\)/);
  assert.match(sql,/comprobante_linea_id,lote_id,producto_id/);
  assert.match(sql,/cls\.comprobante_linea_id=cl\.id/);
});

test('wrapper authenticates and uses the same sale idempotency lock namespace',()=>{
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/public\.mi_usuario_id\(\)/);
  assert.match(sql,/public\.mi_empresa_id\(\)/);
  assert.match(sql,/mi_rol\(\).*NOT IN/s);
  assert.match(sql,/pos:venta:/);
  assert.match(sql,/SALE_IDEMPOTENCY_CONFLICT/);
  assert.match(sql,/SALE_LOT_TRACE_MISSING/);
});

test('FEFO consumes earliest non-expired lots and rejects insufficient lot balance',()=>{
  assert.match(sql,/ORDER BY il\.fecha_vencimiento ASC NULLS LAST,il\.created_at ASC,il\.id ASC/);
  assert.match(sql,/il\.fecha_vencimiento >= \(now\(\) AT TIME ZONE 'America\/Lima'\)::date/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/cantidad_disponible=cantidad_disponible-v_tomar/);
  assert.match(sql,/SALE_FEFO_STOCK_MISMATCH/);
});

test('sale and lot writes share one transaction and function is not public to anon',()=>{
  assert.match(sql,/public\.pos_registrar_venta\(p_venta\)/);
  assert.match(sql,/INSERT INTO public\.comprobante_lote_salida/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.pos_registrar_venta_fefo_auth\(jsonb\) FROM PUBLIC,anon/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pos_registrar_venta_fefo_auth\(jsonb\) TO authenticated/);
  assert.match(sql,/^BEGIN;/);
  assert.match(sql,/COMMIT;\s*$/);
});

test('read-only recovery RPC validates request hash and complete FEFO trace',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.pos_venta_idempotencia_consultar_auth\(p_payload jsonb\)/);
  assert.match(sql,/v_sale\.request_hash IS DISTINCT FROM v_hash/);
  assert.match(sql,/TRACE_INCOMPLETE/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.pos_venta_idempotencia_consultar_auth\(jsonb\) FROM PUBLIC,anon/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pos_venta_idempotencia_consultar_auth\(jsonb\) TO authenticated/);
});
