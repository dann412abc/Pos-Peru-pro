import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql = fs.readFileSync('supabase/migrations-preview/202611090001_returns_read_auth.sql','utf8');
const edge = fs.readFileSync('frontend/functions/api/edge/[[path]].js','utf8');
const page = fs.readFileSync('frontend/src/pages/Devoluciones.tsx','utf8');

test('return read RPC migration scopes data to authenticated POS admin and assigned branches',()=>{
  assert.match(sql,/auth\.uid\(\) IS NULL/);
  assert.match(sql,/public\.mi_rol\(\) IS DISTINCT FROM 'ADMIN'/);
  assert.match(sql,/public\.mi_puede_ver_sucursal/);
  assert.match(sql,/REVOKE ALL ON FUNCTION .* FROM PUBLIC,anon/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION .* TO authenticated/);
});

test('return read RPCs expose history and receipt search without write statements',()=>{
  assert.match(sql,/pos_devoluciones_listar_auth/);
  assert.match(sql,/pos_devoluciones_buscar_auth/);
  assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE)\s+public\./i);
});

test('Cloudflare availability route uses the deployed RPC name',()=>{
  assert.match(edge,/pos_disponibilidad_devolucion/);
  assert.doesNotMatch(edge,/pos_devolucion_disponibilidad_auth/);
});

test('returns page uses Supabase reads and transactional write instead of legacy API in Auth mode',()=>{
  assert.match(page,/fetchSupabaseReturns/);
  assert.match(page,/searchSupabaseReturnReceipts/);
  assert.match(page,/fetchSupabaseReturnAvailability/);
  assert.match(page,/registerSupabaseReturn/);
  assert.match(page,/if \(ES_SUPABASE_AUTH\) \{/);
  assert.match(page,/Emisión electrónica pendiente de integrar/);
});
