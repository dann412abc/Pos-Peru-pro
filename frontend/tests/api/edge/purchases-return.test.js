import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/edge/[[path]].js';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
const params = { path: ['purchases', 'return'] };
const payload = { compraId: 12, motivo: 'Producto vencido', idempotencyKey: 'supplier-return-123456', lineas: [{ compraLineaId: 45, cantidad: 2 }] };
const request = (body, auth = true) => new Request('https://pos.test/api/edge/purchases/return', {
  method: 'POST', headers: { ...(auth ? { authorization: 'Bearer token' } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('devolución a proveedor exige sesión Supabase', async () => {
  const r = await onRequest({ request: request({ payload }, false), env, params });
  assert.equal(r.status, 401);
});

test('devolución rechaza cantidades y líneas duplicadas', async () => {
  const invalid = await onRequest({ request: request({ payload: { ...payload, lineas: [{ compraLineaId: 45, cantidad: 0 }] } }), env, params });
  assert.equal(invalid.status, 400);
  const duplicate = await onRequest({ request: request({ payload: { ...payload, lineas: [...payload.lineas, ...payload.lineas] } }), env, params });
  assert.equal(duplicate.status, 400);
  assert.equal((await duplicate.json()).error, 'DUPLICATE_PURCHASE_LINES');
});

test('devolución informa si falta instalar la RPC sin mutar datos', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"missing function"}', { status: 404 });
  try {
    const r = await onRequest({ request: request({ payload }), env, params });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'PURCHASE_RETURN_MIGRATION_REQUIRED');
  } finally { globalThis.fetch = originalFetch; }
});
