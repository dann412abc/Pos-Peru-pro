import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: { get, post } }));
vi.mock('./client', () => ({ getAccessToken: () => 'valid-supabase-jwt' }));

import {
  fetchSupabaseReturns,
  searchSupabaseReturnReceipts,
  fetchSupabaseReturnAvailability,
  registerSupabaseReturn,
} from './supabaseReturns';

const payload = {
  motivo: 'Producto defectuoso',
  idempotencyKey: 'return-test-0001',
  lineas: [{ comprobanteLineaId: 12, cantidad: 1, reingresarStock: true }],
  pagos: [{ metodoPago: 'YAPE' as const, monto: 10, referencia: 'OP-123' }],
};

describe('adaptador de devoluciones Supabase', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('consulta historial autenticado y normaliza importes', async () => {
    get.mockResolvedValue({ data: [{
      id: '7', comprobanteId: '21', sucursalId: '2', correlativo: '9',
      totalDevolucion: '10.50', creditoRevertido: '2', montoReembolsado: '8.50',
    }] });
    const result = await fetchSupabaseReturns(2);
    expect(get).toHaveBeenCalledWith('/api/edge/returns/list', expect.objectContaining({
      headers: { Authorization: 'Bearer valid-supabase-jwt' },
      params: { sucursalId: 2 },
    }));
    expect(result[0]).toMatchObject({
      id: 7, comprobanteId: 21, sucursalId: 2, correlativo: 9,
      totalDevolucion: 10.5, creditoRevertido: 2, montoReembolsado: 8.5,
    });
  });

  it('busca comprobantes y valida longitud antes de consultar', async () => {
    get.mockResolvedValue({ data: [] });
    await expect(searchSupabaseReturnReceipts(' B001-00009 ', 2)).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith('/api/edge/returns/search', expect.objectContaining({
      params: { q: 'B001-00009', sucursalId: 2 },
    }));
    get.mockClear();
    await expect(searchSupabaseReturnReceipts('x', 2)).rejects.toThrow(/entre 2 y 80/);
    expect(get).not.toHaveBeenCalled();
  });

  it('consulta disponibilidad y rechaza respuestas incompletas', async () => {
    get.mockResolvedValue({ data: { comprobante: { id: 21 }, lineas: [] } });
    await expect(fetchSupabaseReturnAvailability(21)).resolves.toMatchObject({ comprobante: { id: 21 } });
    get.mockResolvedValue({ data: { lineas: [] } });
    await expect(fetchSupabaseReturnAvailability(21)).rejects.toThrow(/disponibilidad.*inválida/i);
    await expect(fetchSupabaseReturnAvailability(0)).rejects.toThrow(/comprobante válido/);
  });

  it('registra devolución con token, clave idempotente y payload validado', async () => {
    post.mockResolvedValue({ data: {
      id: 8, comprobanteId: 21, totalDevolucion: 10,
      creditoRevertido: 0, montoReembolsado: 10,
    } });
    const result = await registerSupabaseReturn(21, payload);
    expect(post).toHaveBeenCalledWith('/api/edge/returns/register', {
      comprobanteId: 21, ...payload,
    }, expect.objectContaining({
      headers: { Authorization: 'Bearer valid-supabase-jwt' },
      timeout: 45000,
    }));
    expect(result.id).toBe(8);
  });

  it('rechaza líneas repetidas, cantidades no válidas y pagos con importes inválidos sin llamar a red', async () => {
    await expect(registerSupabaseReturn(21, {
      ...payload, lineas: [...payload.lineas, ...payload.lineas],
    })).rejects.toThrow(/No repitas líneas/);
    await expect(registerSupabaseReturn(21, {
      ...payload, lineas: [{ ...payload.lineas[0], cantidad: 0.0001 }],
    })).rejects.toThrow(/cantidades válidas/);
    await expect(registerSupabaseReturn(21, {
      ...payload, pagos: [{ metodoPago: 'EFECTIVO', monto: 0 }],
    })).rejects.toThrow(/medios o importes/);
    expect(post).not.toHaveBeenCalled();
  });

  it('rechaza confirmación incompleta y conserva el error de conflicto de inventario', async () => {
    post.mockResolvedValueOnce({ data: { id: 8, comprobanteId: 21 } });
    await expect(registerSupabaseReturn(21, payload)).rejects.toThrow(/confirmación completa/);
    post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'INVENTORY_COUNT_OPEN' } } });
    await expect(registerSupabaseReturn(21, payload)).rejects.toThrow(/inventario físico abierto/);
  });
});
