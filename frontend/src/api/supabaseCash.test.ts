import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: { get, post } }));
vi.mock('./client', () => ({ getAccessToken: () => 'valid-supabase-jwt' }));

import { fetchSupabaseCashSummary, fetchSupabaseCashMovements } from './supabaseCash';

describe('adaptador de Caja Supabase: conciliación de devoluciones', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('incluye total de devoluciones sin mezclarlo con ventas ni medios de pago', async () => {
    get.mockResolvedValue({ data: {
      cantidadVentas: '4',
      totalVentas: '125.50',
      totalDevoluciones: '15.50',
      efectivoEsperado: '80.00',
      porMetodo: { EFECTIVO: '80', TARJETA: '20', YAPE: '15.5', PLIN: '10', CREDITO: '0' },
    } });
    const summary = await fetchSupabaseCashSummary(9);
    expect(get).toHaveBeenCalledWith('/api/edge/cash/summary', expect.objectContaining({
      headers: { Authorization: 'Bearer valid-supabase-jwt' },
      params: { cajaId: 9 },
    }));
    expect(summary).toEqual({
      cantidadVentas: 4,
      totalVentas: 125.5,
      totalDevoluciones: 15.5,
      efectivoEsperado: 80,
      porMetodo: { EFECTIVO: 80, TARJETA: 20, YAPE: 15.5, PLIN: 10, CREDITO: 0 },
    });
  });

  it('tolera respuesta antigua sin totalDevoluciones como cero', async () => {
    get.mockResolvedValue({ data: {
      cantidadVentas: 0, totalVentas: 0, efectivoEsperado: 0,
      porMetodo: { EFECTIVO: 0, TARJETA: 0, YAPE: 0, PLIN: 0, CREDITO: 0 },
    } });
    await expect(fetchSupabaseCashSummary(9)).resolves.toMatchObject({ totalDevoluciones: 0 });
  });

  it('rechaza resumen incompleto e identificador de caja inválido', async () => {
    await expect(fetchSupabaseCashSummary(0)).rejects.toThrow(/caja válida/);
    get.mockResolvedValue({ data: { cantidadVentas: 1, totalVentas: 10, efectivoEsperado: 10, porMetodo: {} } });
    await expect(fetchSupabaseCashSummary(9)).rejects.toThrow(/resumen de caja inválido/);
  });

  it('recupera movimientos de devolución como salidas y valida su integridad', async () => {
    get.mockResolvedValue({ data: [{
      id: '31', tipo: 'SALIDA', metodoPago: 'YAPE', monto: '15.50',
      motivo: 'Devolución #8', createdAt: '2026-11-09T10:00:00.000Z',
    }] });
    const movements = await fetchSupabaseCashMovements(9);
    expect(get).toHaveBeenCalledWith('/api/edge/cash/movements', expect.objectContaining({
      headers: { Authorization: 'Bearer valid-supabase-jwt' },
      params: { cajaId: 9 },
    }));
    expect(movements).toEqual([{
      id: 31, tipo: 'SALIDA', metodoPago: 'YAPE', monto: 15.5,
      motivo: 'Devolución #8', createdAt: '2026-11-09T10:00:00.000Z',
    }]);
  });

  it('rechaza movimientos inválidos y respuestas que no sean listas', async () => {
    await expect(fetchSupabaseCashMovements(0)).rejects.toThrow(/caja válida/);
    get.mockResolvedValueOnce({ data: {} });
    await expect(fetchSupabaseCashMovements(9)).rejects.toThrow(/historial de movimientos inválido/);
    get.mockResolvedValueOnce({ data: [{
      id: 0, tipo: 'DEVOLUCION', metodoPago: 'OTRO', monto: 'NaN', motivo: '', createdAt: null,
    }] });
    await expect(fetchSupabaseCashMovements(9)).rejects.toThrow(/movimiento de caja inválido/);
  });
});
