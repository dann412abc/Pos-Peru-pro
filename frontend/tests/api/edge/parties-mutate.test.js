import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from './[[path]].js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };
const path = { path: ['parties', 'mutate'] };

test('parties/mutate exige una sesión Bearer', async () => {
  const response = await onRequest({ request: new Request('https://pos.example/api/edge/parties/mutate', { method: 'POST', body: JSON.stringify({ action: 'customer_create', payload: {} }) }), env, params: path });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'UNAUTHORIZED');
});

test('parties/mutate rechaza acciones fuera de la lista permitida', async () => {
  const response = await onRequest({ request: new Request('https://pos.example/api/edge/parties/mutate', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ action: 'arbitrary_rpc', payload: {} }) }), env, params: path });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'INVALID_PARTY_MUTATION');
});

test('parties/mutate limita el tamaño del payload antes de llamar Supabase', async () => {
  const payload = { nota: 'x'.repeat(33_000) };
  const response = await onRequest({ request: new Request('https://pos.example/api/edge/parties/mutate', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ action: 'customer_create', payload }) }), env, params: path });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'PARTY_PAYLOAD_TOO_LARGE');
});

test('parties/mutate devuelve 502 controlado si Supabase no responde', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  try {
    const response = await onRequest({ request: new Request('https://pos.example/api/edge/parties/mutate', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ action: 'customer_create', payload: { nombre: 'Prueba' } }) }), env, params: path });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'PARTIES_UNAVAILABLE');
  } finally { globalThis.fetch = originalFetch; }
});
