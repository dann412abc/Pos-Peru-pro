import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070008_purchase_receive_rpc.sql', import.meta.url), 'utf8');
test('RPC purchase receive is auth-bound and not callable by anon', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /supabase_auth_user_id=v_auth/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_compra_recibir_auth\(jsonb\) FROM PUBLIC,anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_compra_recibir_auth\(jsonb\) TO authenticated/);
});
test('purchase transaction persists inventory, lots, weighted cost, payments and cash movements', () => {
  for (const table of ['compra_linea','inventario_lote','movimiento_inventario','producto_stock','producto_variante_stock','compra_pago','caja_movimiento']) assert.match(sql, new RegExp('INSERT INTO public\\.' + table + '|UPDATE public\\.' + table));
  assert.match(sql, /v_costo_nuevo/);
});
test('purchase guards cover idempotency, IGV, cash/credit and branch ownership', () => {
  assert.match(sql, /idempotency_key/);
  assert.match(sql, /abs\(v_pagado-v_total\)>0\.01/);
  assert.match(sql, /tipo_igv/);
  assert.match(sql, /usuario_sucursal/);
  assert.match(sql, /saldo_pendiente/);
});

test('purchase receipt preserves bigint variant identifiers without narrowing casts', () => {
  assert.match(sql, /v_variante bigint/);
  assert.match(sql, /NULLIF\(v_line->>'varianteId',''\)::bigint/);
  assert.doesNotMatch(sql, /NULLIF\(v_line->>'varianteId',''\)::integer/);
});

test('purchase idempotency is serialized before replay lookup and binds the key to its payload',()=>{
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('pos:compra:'/);
  assert.ok(sql.indexOf('pg_advisory_xact_lock')<sql.indexOf('SELECT c.id,c.request_hash'));
  assert.match(sql,/v_existing_hash IS DISTINCT FROM v_request_hash/);
  assert.match(sql,/idempotency_key,request_hash\)/);
});
