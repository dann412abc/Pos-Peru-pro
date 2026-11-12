import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/edge/[[path]].js';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
const params = { path: ['purchases', 'cancel'] };
const payload = { compraId: 12, motivo: 'Error de registro' };
const request = (body, auth = true) => new Request('https://pos.test/api/edge/purchases/cancel', {
  method: 'POST', headers: { ...(auth ? { authorization: 'Bearer test-user-token' } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body),
});
test('anulación exige sesión Supabase', async () => {
  const r = await onRequest({ request: request({ payload }, false), env, params });
  assert.equal(r.status, 401);
});
test('anulación valida compra y motivo', async () => {
  const r = await onRequest({ request: request({ payload: { compraId: 0, motivo: 'no' } }), env, params });
  assert.equal(r.status, 400);
});
test('anulación informa migración pendiente sin confirmar cambios', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"function missing"}', { status: 404 });
  try {
    const r = await onRequest({ request: request({ payload }), env, params });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'PURCHASE_CANCEL_MIGRATION_REQUIRED');
  } finally { globalThis.fetch = original; }
});
test('anulación transmite JWT y payload a la RPC', async () => {
  const original = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url: String(url), init }; return Response.json({ ok: true, estado: 'ANULADA' }); };
  try {
    const r = await onRequest({ request: request({ payload }), env, params });
    assert.equal(r.status, 200);
    assert.match(seen.url, /pos_compra_anular_auth$/);
    assert.equal(seen.init.headers.authorization, 'Bearer test-user-token');
    assert.deepEqual(JSON.parse(seen.init.body), { p_payload: payload });
  } finally { globalThis.fetch = original; }
});
