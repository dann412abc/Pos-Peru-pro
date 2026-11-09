import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './[[path]].js';

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-anon' };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

async function post(path, body) {
  return onRequest({
    params: { path },
    env,
    request: new Request('https://pos.test/api/edge/' + path.join('/'), {
      method: 'POST',
      headers: { authorization: 'Bearer signed-user-token', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
}

describe('physical count stock movement protection responses', () => {
  it('returns a clear 409 when a sale is blocked by an open physical count', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      code: '55000',
      message: 'INVENTORY_COUNT_OPEN: stock movements are blocked until the physical count is closed',
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    const response = await post(['sales', 'register'], {
      payload: { sucursalId: 2, idempotencyKey: 'sale-key-123', lineas: [{}], pagos: [{}] },
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe('INVENTORY_COUNT_OPEN');
    expect(body.message).toContain('Cierra el conteo');
  });

  it('maps PostgREST details as well as the primary message', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      code: '55000',
      message: 'new row violates stock guard',
      details: 'INVENTORY_COUNT_OPEN',
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    const response = await post(['inventory', 'adjust'], {
      payload: { sucursalId: 2, productoId: 8, tipo: 'ENTRADA', cantidad: 1,
        motivo: 'Ajuste de prueba', idempotencyKey: 'adjust-key-123' },
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('INVENTORY_COUNT_OPEN');
  });

  it('preserves unrelated RPC errors and their original status', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      code: '23514', message: 'SALE_FEFO_STOCK_MISMATCH',
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    const response = await post(['sales', 'register'], {
      payload: { sucursalId: 2, idempotencyKey: 'sale-key-456', lineas: [{}], pagos: [{}] },
    });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('SALE_FEFO_STOCK_MISMATCH');
  });
});
