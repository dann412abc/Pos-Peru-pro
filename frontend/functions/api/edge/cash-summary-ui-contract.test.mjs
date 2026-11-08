import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const edge = readFileSync(new URL('./[[path]].js', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../../../src/api/supabaseCash.ts', import.meta.url), 'utf8');
test('Cloudflare publica resumen de caja solo con Bearer y RPC estrecha', () => {
  assert.match(edge, /route === 'cash\/summary'/);
  assert.match(edge, /if \(!token\) return json\(\{ error: 'UNAUTHORIZED'/);
  assert.match(edge, /pos_caja_resumen_auth/);
});
test('helper valida caja, token y contrato de desglose de medios', () => {
  assert.match(helper, /getAccessToken\(\)/);
  assert.match(helper, /Number\.isSafeInteger\(cajaId\)/);
  for (const method of ['EFECTIVO','TARJETA','YAPE','PLIN','CREDITO']) assert.match(helper, new RegExp(method));
});
