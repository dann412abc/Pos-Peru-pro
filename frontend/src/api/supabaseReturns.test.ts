import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: { get, post } }));
vi.mock('./client', () => ({ getAccessToken: () => 'valid-supabase-jwt' }));

import {
  fetchSupabaseReturns, searchSupabaseReturnReceipts, fetchSupabaseReturnAvailability,
  preflightSupabaseReturn, verifySupabaseReturnsSchema,
} from './supabaseReturns';

describe('adaptador de consultas de devoluciones Supabase', () => {
  beforeEach(() => { get.mockReset(); post.mockReset(); });

  it('consulta el historial con sucursal y JWT del usuario', async () => {
    get.mockResolvedValue({ data: [{ id: 3, totalDevolucion: 12 }] });
    await expect(fetchSupabaseReturns(2)).resolves.toEqual([{ id: 3, totalDevolucion: 12 }]);
    expect(get).toHaveBeenCalledWith('/api/edge/returns/list', expect.objectContaining({
      headers: { Authorization: 'Bearer valid-supabase-jwt' }, params: { sucursalId: 2 },
    }));
  });

  it('rechaza sucursal inválida antes de llamar a la API', async () => {
    await expect(fetchSupabaseReturns(0)).rejects.toThrow(/sucursal válida/);
    expect(get).not.toHaveBeenCalled();
  });

  it('busca comprobantes con texto normalizado y no acepta búsquedas cortas', async () => {
    get.mockResolvedValue({ data: [{ id: 90, tipo: '03' }] });
    await expect(searchSupabaseReturnReceipts(' B001-12 ', 2)).resolves.toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/api/edge/returns/search', expect.objectContaining({
      params: { q: 'B001-12', sucursalId: 2 },
    }));
    await expect(searchSupabaseReturnReceipts('x')).rejects.toThrow(/2 y 80/);
  });

  it('consulta disponibilidad con ID válido y comprueba la estructura', async () => {
    const data = { comprobante: { id: 90 }, lineas: [] };
    get.mockResolvedValue({ data });
    await expect(fetchSupabaseReturnAvailability(90)).resolves.toEqual(data);
    expect(get).toHaveBeenCalledWith('/api/edge/returns/availability', expect.objectContaining({
      params: { comprobanteId: 90 },
    }));
    get.mockResolvedValue({ data: { comprobante: null, lineas: [] } });
    await expect(fetchSupabaseReturnAvailability(90)).rejects.toThrow(/disponibilidad inválida/);
  });

  it('prevalida sin registrar y envía solo el contrato esperado', async () => {
    post.mockResolvedValue({ data: { ok: true, duplicado: false, mensaje: 'Prevalidación correcta. No se ha registrado ni modificado ningún dato.' } });
    const payload = {
      motivo: 'Producto defectuoso',
      idempotencyKey: 'return-123456',
      lineas: [{ comprobanteLineaId: 10, cantidad: 1, reingresarStock: true }],
      pagos: [{ metodoPago: 'EFECTIVO' as const, monto: 12 }],
    };
    await expect(preflightSupabaseReturn(90, payload)).resolves.toMatchObject({ ok: true });
    expect(post).toHaveBeenCalledWith('/api/edge/rpc/pos_devolucion_prevalidar_auth', {
      p_comprobante_id: 90, p_payload: payload,
    }, expect.any(Object));
  });

  it('rechaza una respuesta que no confirma prevalidación exclusivamente', async () => {
    post.mockResolvedValue({ data: { ok: true, duplicado: false, mensaje: 'Devolución registrada' } });
    await expect(preflightSupabaseReturn(90, {
      motivo: 'Producto defectuoso', idempotencyKey: 'return-123456',
      lineas: [{ comprobanteLineaId: 10, cantidad: 1, reingresarStock: true }], pagos: [],
    })).rejects.toThrow(/solo una prevalidación/);
  });

  it('verifica esquema y exige que la escritura siga bloqueada', async () => {
    post.mockResolvedValue({ data: { ok: true, faltantes: [], puedeHabilitarRegistro: false } });
    await expect(verifySupabaseReturnsSchema()).resolves.toMatchObject({ ok: true, puedeHabilitarRegistro: false });
    post.mockResolvedValue({ data: { ok: true, faltantes: [], puedeHabilitarRegistro: true } });
    await expect(verifySupabaseReturnsSchema()).rejects.toThrow(/diagnóstico de esquema inválido/);
  });
});
