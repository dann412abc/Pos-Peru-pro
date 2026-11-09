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


export interface InventoryWastePayload {
  sucursalId: number;
  productoId: number;
  varianteId?: number | null;
  cantidad: number;
  motivoTipo: 'VENCIDO' | 'DANADO' | 'PERDIDA' | 'CONTAMINACION' | 'OTRO';
  observacion: string;
  idempotencyKey: string;
}

function supabaseInventoryToken(): string {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para gestionar mermas.');
  return token;
}

/** Carga lotes disponibles para registrar una merma en la sucursal activa. */
export async function listarLotesMermaSupabase(sucursalId: number): Promise<any[]> {
  const token = supabaseInventoryToken();
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('Sucursal inválida.');
  const response = await axios.get('/api/edge/inventory/waste/lots', {
    params: { sucursalId }, headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
  });
  if (!Array.isArray(response.data)) throw new Error('Supabase no devolvió la lista de lotes.');
  return response.data;
}

/** Consulta el historial de mermas autorizado por sucursal. */
export async function listarMermasSupabase(sucursalId: number): Promise<any[]> {
  const token = supabaseInventoryToken();
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('Sucursal inválida.');
  const response = await axios.get('/api/edge/inventory/waste/history', {
    params: { sucursalId }, headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
  });
  if (!Array.isArray(response.data)) throw new Error('Supabase no devolvió el historial de mermas.');
  return response.data;
}

/** Registra merma, salida de stock y consumo FEFO de lotes en una transacción. */
export async function registrarMermaSupabase(payload: InventoryWastePayload): Promise<Record<string, unknown>> {
  const token = supabaseInventoryToken();
  const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (!validId(payload.sucursalId) || !validId(payload.productoId) ||
      !(payload.varianteId == null || validId(payload.varianteId)) ||
      !Number.isFinite(payload.cantidad) || payload.cantidad <= 0 ||
      Math.round(payload.cantidad * 1000) !== payload.cantidad * 1000 ||
      !['VENCIDO','DANADO','PERDIDA','CONTAMINACION','OTRO'].includes(payload.motivoTipo) ||
      typeof payload.observacion !== 'string' || payload.observacion.trim().length < 5 || payload.observacion.length > 500 ||
      !/^[A-Za-z0-9._:-]{12,100}$/.test(payload.idempotencyKey)) {
    throw new Error('Los datos de la merma no son válidos.');
  }
  const response = await axios.post('/api/edge/inventory/waste', {
    payload: { ...payload, observacion: payload.observacion.trim() },
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 45000 });
  if (!response.data || response.data.ok !== true || response.data.trazabilidadLotes !== true) {
    throw new Error('Supabase no confirmó la merma ni la trazabilidad de lotes.');
  }
  return response.data;
}


export interface InventoryCountOpenPayload {
  sucursalId: number;
  observacion: string;
}

function inventoryCountToken(): string {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para gestionar el inventario físico.');
  return token;
}

async function inventoryCountRequest<T>(method: 'get' | 'post', path: string, data?: unknown): Promise<T> {
  const token = inventoryCountToken();
  const response = await axios.request<T>({
    method, url: `/api/edge/inventory/counts${path}`, data,
    headers: { Authorization: `Bearer ${token}` }, timeout: 45000,
  });
  return response.data;
}

/** Historial de inventarios físicos de las sucursales autorizadas por Supabase. */
export function listarConteosFisicosSupabase(): Promise<any[]> {
  return inventoryCountRequest<any[]>('get', '');
}

/** Abre el conteo y toma un snapshot de productos base y variantes. */
export function abrirConteoFisicoSupabase(payload: InventoryCountOpenPayload): Promise<any> {
  if (!Number.isSafeInteger(payload.sucursalId) || payload.sucursalId <= 0 ||
      typeof payload.observacion !== 'string' || payload.observacion.trim().length < 5 ||
      payload.observacion.trim().length > 200) throw new Error('Datos del inventario físico no válidos.');
  return inventoryCountRequest<any>('post', '', { ...payload, observacion: payload.observacion.trim() });
}

/** Obtiene el detalle y cantidades contadas de un inventario físico. */
export function detalleConteoFisicoSupabase(conteoId: number): Promise<any> {
  if (!Number.isSafeInteger(conteoId) || conteoId <= 0) throw new Error('Inventario inválido.');
  return inventoryCountRequest<any>('get', `/${conteoId}`);
}

/** Guarda una cantidad física con hasta tres decimales. */
export function contarLineaFisicaSupabase(lineaId: number, cantidadContada: number): Promise<any> {
  if (!Number.isSafeInteger(lineaId) || lineaId <= 0 || !Number.isFinite(cantidadContada) ||
      cantidadContada < 0 || Math.round(cantidadContada * 1000) !== cantidadContada * 1000) {
    throw new Error('La cantidad contada no es válida.');
  }
  return inventoryCountRequest<any>('post', '/lines/count', { lineaId, cantidadContada });
}

/** Cierra el conteo y aplica todas las diferencias dentro de una transacción PostgreSQL. */
export function cerrarConteoFisicoSupabase(conteoId: number): Promise<any> {
  if (!Number.isSafeInteger(conteoId) || conteoId <= 0) throw new Error('Inventario inválido.');
  return inventoryCountRequest<any>('post', `/${conteoId}/close`);
}
