import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.join(process.cwd(),'frontend/src/api/supabaseReturns.ts'),'utf8');
test('Supabase returns exposes both read-only preflight and authenticated commit operations',()=>{
  assert.match(source,/preflightSupabaseReturn/);
  assert.match(source,/pos_devolucion_prevalidar_auth/);
  assert.match(source,/Nunca registra la devolución/);
  assert.match(source,/registerSupabaseReturn/);\n  assert.match(source,/pos_devolucion_registrar_auth|returns\\/register/);
});
test('preflight client validates payload and requires authenticated headers',()=>{
  assert.match(source,/authHeaders\(\)/);
  assert.match(source,/motivo\.length < 5/);
  assert.match(source,/payload\.lineas\.length > 100/);
  assert.match(source,/idempotencyKey/);
});
test('preflight rejects responses that do not confirm non-mutating validation',()=>{
  assert.match(source,/response\.data\.ok !== true/);
  assert.match(source,/No se ha registrado/);
});
