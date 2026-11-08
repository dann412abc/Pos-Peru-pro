import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('./202611070046_returns_read_auth.sql', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../../frontend/functions/api/edge/[[path]].js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../../frontend/src/api/supabaseReturns.ts', import.meta.url), 'utf8');
test('return read RPCs derive identity from auth.uid and validate active POS user', () => {
  assert.equal((sql.match(/auth\.uid\(\)/g) || []).length, 3);
  assert.equal((sql.match(/u\.supabase_auth_user_id=v_auth AND u\.activo=true/g) || []).length, 3);
});
test('return list and receipt search restrict company and authorized branches', () => {
  assert.match(sql, /d\.sucursal_id=ANY\(v_ids\)/);
  assert.match(sql, /c\.sucursal_id=ANY\(v_ids\)/);
  assert.match(sql, /p_sucursal_id=ANY\(v_ids\)/);
  assert.match(sql, /c\.tipo IN \('01','03'\)/);
});
test('availability excludes annulled receipts and subtracts registered returns', () => {
  assert.match(sql, /v_c->>'estado'='ANULADA'/);
  assert.match(sql, /SUM\(dl\.cantidad\)/);
  assert.match(sql, /SUM\(dl\.monto\)/);
  assert.match(sql, /d\.estado='REGISTRADA'/);
});
test('read RPC execution is denied to public and anon and granted to authenticated', () => {
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION/g) || []).length, 3);
  assert.equal((sql.match(/TO authenticated/g) || []).length, 3);
});
test('Cloudflare exposes only authenticated read endpoints and maps inputs to RPCs', () => {
  assert.match(edge, /returns\/list/);
  assert.match(edge, /returns\/search/);
  assert.match(edge, /returns\/availability/);
  assert.match(edge, /pos_devoluciones_listar_auth/);
  assert.match(edge, /pos_devoluciones_buscar_auth/);
  assert.match(edge, /pos_devolucion_disponibilidad_auth/);
  assert.match(edge, /getBearer\(request\)/);
});
test('frontend read client validates server responses and never registers returns', () => {
  assert.match(api, /fetchSupabaseReturns/);
  assert.match(api, /searchSupabaseReturnReceipts/);
  assert.match(api, /fetchSupabaseReturnAvailability/);
  assert.doesNotMatch(api, /devolucion.*registrar|pos_devolucion_registrar_auth/i);
});
