import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from './[[path]].js';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
const params = { path: ['purchases', 'payment'] };
const payload = { compraId: 12, monto: 25.5, metodoPago: 'YAPE', cajaId: 3, idempotencyKey: 'purchase-payment-123456' };

test('pago a proveedor exige sesión Supabase', async () => {
  const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/payment', { method: 'POST', body: JSON.stringify({ payload }) }), env, params });
  assert.equal(r.status, 401);
});

test('pago a proveedor rechaza importe, compra y método inválidos', async () => {
  const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/payment', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify({ payload: { ...payload, monto: 0 } }) }), env, params });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'INVALID_PURCHASE_PAYMENT');
});

test('pago a proveedor informa si falta instalar la RPC preview', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"missing function"}', { status: 404 });
  try {
    const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/payment', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify({ payload }) }), env, params });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'PURCHASE_PAYMENT_MIGRATION_REQUIRED');
  } finally { globalThis.fetch = originalFetch; }
});
