import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from './[[path]].js';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-test' };
const request = (body, authorization = 'Bearer user-jwt') => new Request('https://pos.example/api/edge/sales/comprobante-detail', {
  method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('detalle de comprobante exige sesión autenticada', async () => {
  const response = await onRequest({ request: request({ comprobanteId: 7 }, ''), env, params: { path: ['sales', 'comprobante-detail'] } });
  assert.equal(response.status, 401);
});

test('detalle valida ID antes de consultar Supabase', async () => {
  for (const comprobanteId of [0, -1, 1.5, 'no-id']) {
    const response = await onRequest({ request: request({ comprobanteId }), env, params: { path: ['sales', 'comprobante-detail'] } });
    assert.equal(response.status, 400);
  }
});

test('detalle invoca RPC segura con JWT de usuario y solo ID del comprobante', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response('{"id":7,"serie":"B001"}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await onRequest({ request: request({ comprobanteId: 7 }), env, params: { path: ['sales', 'comprobante-detail'] } });
    assert.equal(response.status, 200);
    assert.match(captured.url, /pos_comprobante_detalle_auth$/);
    assert.equal(captured.init.headers.authorization, 'Bearer user-jwt');
    assert.equal(captured.init.headers.apikey, 'anon-test');
    assert.deepEqual(JSON.parse(captured.init.body), { p_comprobante_id: 7 });
    assert.doesNotMatch(captured.init.body, /empresa|usuario|service_role/i);
  } finally { globalThis.fetch = originalFetch; }
});
