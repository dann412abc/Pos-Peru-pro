import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../../functions/api/edge/[[path]].js';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
const params = { path: ['purchases', 'receive'] };
const base = { sucursalId: 1, proveedorId: 2, tipoDocumento: '01', serie: 'F001', numero: '100', fechaDocumento: '2026-11-09', condicionPago: 'CONTADO', idempotencyKey: 'purchase-test-0001', lineas: [{ productoId: 3, cantidad: 1, unidadCompra: 'UNIDAD', unidadesPorEmpaque: 1, costoEmpaque: 10, costoUnitario: 10, tipoIgv: 10 }], pagos: [{ metodoPago: 'TRANSFERENCIA', monto: 11.8 }] };

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

test('purchases/receive rechaza líneas incompletas o cantidades no positivas', async () => {
  const payload = { ...base, lineas: [{ ...base.lineas[0], unidadesPorEmpaque: 0 }] };
  const r = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/receive', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ payload }) }), env, params });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'INVALID_PURCHASE_PAYLOAD');
});

test('purchases/receive rechaza pagos no permitidos y crédito con pago inicial', async () => {
  const invalidPayment = { ...base, pagos: [{ metodoPago: 'BITCOIN', monto: 10 }] };
  const r1 = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/receive', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ payload: invalidPayment }) }), env, params });
  assert.equal(r1.status, 400);
  const invalidCredit = { ...base, condicionPago: 'CREDITO', fechaVencimiento: '2026-12-01' };
  const r2 = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/receive', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ payload: invalidCredit }) }), env, params });
  assert.equal(r2.status, 400);
});

test('purchases/receive aplica tipos IGV permitidos y evita líneas duplicadas por producto/variante', async () => {
  const invalidIgv = { ...base, lineas: [{ ...base.lineas[0], tipoIgv: 0 }] };
  const r1 = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/receive', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ payload: invalidIgv }) }), env, params });
  assert.equal(r1.status, 400);
  const duplicated = { ...base, lineas: [base.lineas[0], { ...base.lineas[0] }] };
  const r2 = await onRequest({ request: new Request('https://pos.test/api/edge/purchases/receive', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ payload: duplicated }) }), env, params });
  assert.equal(r2.status, 400);
});
