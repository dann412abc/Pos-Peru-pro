import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from './[[path]].js';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
const params = { path: ['purchases', 'receive'] };
const base = { sucursalId: 1, proveedorId: 2, idempotencyKey: 'purchase-test-0001', lineas: [{ productoId: 3, cantidad: 1 }], pagos: [] };

test('purchases/receive exige sesión Supabase', async () => {
  const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/receive', { method: 'POST', body: JSON.stringify({ payload: base }) }), env, params });
  assert.equal(r.status, 401);
});
test('purchases/receive valida idempotencia y líneas antes de llamar RPC', async () => {
  const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/receive', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ payload: { ...base, idempotencyKey: 'x', lineas: [] } }) }), env, params });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'INVALID_PURCHASE_PAYLOAD');
});
test('purchases/receive no declara éxito si la RPC aún no está instalada', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"missing function"}', { status: 404 });
  try {
    const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/receive', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ payload: base }) }), env, params });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'PURCHASE_MIGRATION_REQUIRED');
  } finally { globalThis.fetch = originalFetch; }
});
