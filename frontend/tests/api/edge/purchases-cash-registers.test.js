import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/edge/[[path]].js';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
const params = { path: ['purchases', 'cash-registers'] };
const request = (url, auth = true) => new Request(url, { headers: auth ? { authorization: 'Bearer test-user-token' } : {} });

test('consulta de cajas exige sesión Supabase', async () => {
  const r = await onRequest({ request: request('https://pos.test/api/edge/purchases/cash-registers?sucursalId=1', false), env, params });
  assert.equal(r.status, 401);
});

test('consulta de cajas valida sucursal', async () => {
  const r = await onRequest({ request: request('https://pos.test/api/edge/purchases/cash-registers?sucursalId=0'), env, params });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'INVALID_CASH_REGISTER_QUERY');
});

test('consulta de cajas informa migración pendiente sin inventar cajas', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"function missing"}', { status: 404 });
  try {
    const r = await onRequest({ request: request('https://pos.test/api/edge/purchases/cash-registers?sucursalId=1'), env, params });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'PURCHASE_CASH_MIGRATION_REQUIRED');
  } finally { globalThis.fetch = original; }
});

test('consulta de cajas transmite sucursal y JWT a RPC', async () => {
  const original = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url: String(url), init }; return Response.json({ cajas: [{ id: 3, saldoInicial: 100 }] }); };
  try {
    const r = await onRequest({ request: request('https://pos.test/api/edge/purchases/cash-registers?sucursalId=7'), env, params });
    assert.equal(r.status, 200);
    assert.match(seen.url, /pos_compras_cajas_abiertas_auth$/);
    assert.equal(seen.init.headers.authorization, 'Bearer test-user-token');
    assert.deepEqual(JSON.parse(seen.init.body), { p_sucursal_id: 7 });
  } finally { globalThis.fetch = original; }
});
