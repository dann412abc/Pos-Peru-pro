import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/edge/[[path]].js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-test' };
const req = (url, token = 'user-jwt') => new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });

test('supplier analytics rejects requests without a Supabase session', async () => {
  const response = await onRequest({ request: req('https://pos.test/api/edge/purchases/supplier-analytics?sucursalId=2', null), env, params: { path: ['purchases', 'supplier-analytics'] } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});

test('supplier analytics rejects invalid branch identifiers before calling Supabase', async () => {
  const response = await onRequest({ request: req('https://pos.test/api/edge/purchases/supplier-analytics?sucursalId=0'), env, params: { path: ['purchases', 'supplier-analytics'] } });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'INVALID_SUPPLIER_ANALYTICS_QUERY');
});

test('supplier analytics forwards the user JWT and authorized branch to the SQL RPC', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ proveedores: [], preciosRecientes: [], comparacionCostos: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await onRequest({ request: req('https://pos.test/api/edge/purchases/supplier-analytics?sucursalId=12', 'jwt-user'), env, params: { path: ['purchases', 'supplier-analytics'] } });
    assert.equal(response.status, 200);
    assert.match(captured.url, /pos_compras_analisis_proveedores_auth$/);
    assert.equal(captured.init.headers.authorization, 'Bearer jwt-user');
    assert.deepEqual(JSON.parse(captured.init.body), { p_sucursal_id: 12 });
    assert.deepEqual(await response.json(), { proveedores: [], preciosRecientes: [], comparacionCostos: [] });
  } finally { globalThis.fetch = originalFetch; }
});

test('supplier analytics reports a missing preview migration without fabricating data', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('missing', { status: 404 });
  try {
    const response = await onRequest({ request: req('https://pos.test/api/edge/purchases/supplier-analytics?sucursalId=12'), env, params: { path: ['purchases', 'supplier-analytics'] } });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'SUPPLIER_ANALYTICS_MIGRATION_REQUIRED');
  } finally { globalThis.fetch = originalFetch; }
});
