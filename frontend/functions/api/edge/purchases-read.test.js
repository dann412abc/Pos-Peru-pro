import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from './[[path]].js';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
const params = { path: ['purchases'] };

test('purchases GET exige sesión Supabase', async () => {
  const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases?sucursalId=1'), env, params });
  assert.equal(r.status, 401);
});

test('purchases GET valida sucursal y compra', async () => {
  const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases?sucursalId=0&compraId=abc', { headers: { authorization: 'Bearer test-token' } }), env, params });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'INVALID_PURCHASE_QUERY');
});

test('purchases GET informa que la RPC preview no está instalada', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"missing function"}', { status: 404 });
  try {
    const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases?sucursalId=1', { headers: { authorization: 'Bearer test-token' } }), env, params });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'PURCHASE_READ_MIGRATION_REQUIRED');
  } finally { globalThis.fetch = originalFetch; }
});
