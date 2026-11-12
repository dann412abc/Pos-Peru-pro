import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/edge/[[path]].js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-test' };
const payload = { sucursalId: 1, idempotencyKey: 'sale-test-key-1234', tipo: '03', lineas: [{ productoId: 1, cantidad: 1, precioUnitario: 10, descuento: 0 }], pagos: [{ metodo: 'EFECTIVO', monto: 10 }] };
const request = (body, authorization = 'Bearer user-token') => new Request('https://pos.example/api/edge/sales/idempotency-check', {
  method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('sales idempotency preflight requires a Supabase bearer session', async () => {
  const response = await onRequest({ request: request({ payload }, ''), env, params: { path: ['sales', 'idempotency-check'] } });
  assert.equal(response.status, 401);
});

test('sales idempotency preflight rejects malformed payload before contacting Supabase', async () => {
  const response = await onRequest({ request: request({ payload: { ...payload, idempotencyKey: 'bad' } }), env, params: { path: ['sales', 'idempotency-check'] } });
  assert.equal(response.status, 400);
});

test('sales idempotency preflight forwards payload with caller bearer and public RPC headers', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response('{"ok":true,"existente":false}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await onRequest({ request: request({ payload }), env, params: { path: ['sales', 'idempotency-check'] } });
    assert.equal(response.status, 200);
    assert.match(captured.url, /pos_venta_idempotencia_consultar_auth$/);
    assert.equal(captured.init.headers.authorization, 'Bearer user-token');
    assert.equal(captured.init.headers.apikey, 'anon-test');
    assert.deepEqual(JSON.parse(captured.init.body), { p_payload: payload });
  } finally { globalThis.fetch = originalFetch; }
});

test('SQL preview stores request hash and derives identity from auth.uid()', async () => {
  const sql = await (await import('node:fs/promises')).readFile(new URL('../../../../supabase/migrations-preview/202611070019_sales_idempotency_preflight.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS request_hash/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /md5\(\(p_payload - 'idempotencyKey'\)::text\)/);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO authenticated/);
  assert.match(sql, /No registra ventas ni stock/);
});


test('sales idempotency preflight rejects invalid line quantities and prices', async () => {
  for (const line of [
    { productoId: 1, cantidad: 0, precioUnitario: 10 },
    { productoId: 1, cantidad: 1, precioUnitario: -1 },
    { productoId: 1, cantidad: 1, precioUnitario: 10, varianteId: 0 },
  ]) {
    const response = await onRequest({ request: request({ payload: { ...payload, lineas: [line] } }), env, params: { path: ['sales', 'idempotency-check'] } });
    assert.equal(response.status, 400);
  }
});

test('sales idempotency preflight rejects unsupported or non-positive payments', async () => {
  for (const payment of [
    { metodo: 'BITCOIN', monto: 10 },
    { metodo: 'YAPE', monto: 0 },
    { metodo: 'EFECTIVO', monto: -1 },
  ]) {
    const response = await onRequest({ request: request({ payload: { ...payload, pagos: [payment] } }), env, params: { path: ['sales', 'idempotency-check'] } });
    assert.equal(response.status, 400);
  }
});
