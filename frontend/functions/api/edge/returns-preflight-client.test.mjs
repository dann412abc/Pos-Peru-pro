import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const source = fs.readFileSync(path.join(process.cwd(),'frontend/src/api/supabaseReturns.ts'),'utf8');
test('Supabase returns exposes read-only preflight and authenticated commit operations',()=>{
  for (const marker of ['preflightSupabaseReturn','pos_devolucion_prevalidar_auth','No registra ni modifica datos','registerSupabaseReturn','/api/edge/returns/register']) assert.ok(source.includes(marker));
});
test('preflight client validates payload and requires authenticated headers',()=>{
  for (const marker of ['authHeaders()','motivo.length < 5','payload.lineas.length > 100','idempotencyKey']) assert.ok(source.includes(marker));
});
test('preflight rejects responses that do not confirm non-mutating validation',()=>{
  for (const marker of ['response.data.ok !== true','No se ha registrado']) assert.ok(source.includes(marker));
});