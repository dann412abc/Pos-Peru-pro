import axios from 'axios';
import { getAccessToken } from './client';

export interface InventoryAdjustmentPayload {
  sucursalId: number;
  productoId: number;
  varianteId?: number | null;
  tipo: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  motivo: string;
  idempotencyKey: string;
}

/** Ajusta existencias y lotes en una sola transacción autenticada en Supabase. */
export async function registrarAjusteInventarioSupabase(payload: InventoryAdjustmentPayload): Promise<Record<string, unknown>> {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para ajustar inventario.');
  if (!Number.isSafeInteger(payload.sucursalId) || payload.sucursalId <= 0 ||
      !Number.isSafeInteger(payload.productoId) || payload.productoId <= 0 ||
      !(payload.varianteId == null || (Number.isSafeInteger(payload.varianteId) && payload.varianteId > 0)) ||
      !['ENTRADA','SALIDA'].includes(payload.tipo) ||
      !Number.isFinite(payload.cantidad) || payload.cantidad <= 0 ||
      Math.round(payload.cantidad * 1000) !== payload.cantidad * 1000 ||
      payload.motivo.trim().length < 5 ||
      !/^[A-Za-z0-9._:-]{12,100}$/.test(payload.idempotencyKey)) {
    throw new Error('Los datos del ajuste de inventario no son válidos.');
  }
  const response = await axios.post('/api/edge/inventory/adjust', { payload }, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
  });
  if (!response.data || response.data.ok !== true || response.data.trazabilidadLotes !== true) {
    throw new Error('Supabase no confirmó el ajuste ni la trazabilidad de lotes.');
  }
  return response.data;
}
