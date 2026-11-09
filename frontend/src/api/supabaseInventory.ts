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


export interface InventoryTransferLine {
  productoId: number;
  varianteId?: number | null;
  cantidad: number;
}

export interface InventoryTransferPayload {
  sucursalOrigenId: number;
  sucursalDestinoId: number;
  motivo: string;
  idempotencyKey: string;
  lineas: InventoryTransferLine[];
}

/** Transfiere productos y variantes conservando lotes/vencimientos en una RPC atómica. */
export async function transferirInventarioSupabase(payload: InventoryTransferPayload): Promise<Record<string, unknown>> {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para transferir inventario.');
  const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (!validId(payload.sucursalOrigenId) || !validId(payload.sucursalDestinoId) ||
      payload.sucursalOrigenId === payload.sucursalDestinoId ||
      typeof payload.motivo !== 'string' || payload.motivo.trim().length < 5 || payload.motivo.length > 200 ||
      !/^[A-Za-z0-9._:-]{12,100}$/.test(payload.idempotencyKey) ||
      !Array.isArray(payload.lineas) || payload.lineas.length < 1 || payload.lineas.length > 200 ||
      payload.lineas.some(line => !validId(line.productoId) ||
        !(line.varianteId == null || validId(line.varianteId)) ||
        !Number.isFinite(line.cantidad) || line.cantidad <= 0 ||
        Math.round(line.cantidad * 1000) !== line.cantidad * 1000) ||
      new Set(payload.lineas.map(line => `${line.productoId}:${line.varianteId ?? 'base'}`)).size !== payload.lineas.length) {
    throw new Error('Los datos de la transferencia no son válidos.');
  }
  const response = await axios.post('/api/edge/inventory/transfers', {
    payload: { ...payload, motivo: payload.motivo.trim() },
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 45000 });
  if (!response.data || response.data.ok !== true || response.data.trazabilidadLotes !== true ||
      response.data.incluyeVariantes !== true || !Array.isArray(response.data.lineas)) {
    throw new Error('Supabase no confirmó la transferencia con trazabilidad de lotes y variantes.');
  }
  return response.data;
}
