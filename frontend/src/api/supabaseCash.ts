import axios from 'axios';
import { getAccessToken } from './client';

export type SupabaseCashSummary = {
  cantidadVentas: number;
  totalVentas: number;
  totalDevoluciones: number;
  porMetodo: Record<'EFECTIVO'|'TARJETA'|'YAPE'|'PLIN'|'CREDITO', number>;
  efectivoEsperado: number;
};

export async function fetchSupabaseCashSummary(cajaId: number): Promise<SupabaseCashSummary> {
  if (!Number.isSafeInteger(cajaId) || cajaId <= 0) throw new Error('Selecciona una caja válida.');
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para consultar caja.');
  const response = await axios.get('/api/edge/cash/summary', {
    headers: { Authorization: `Bearer ${token}` }, params: { cajaId }, timeout: 15000,
  });
  const data = response.data;
  const methods = ['EFECTIVO','TARJETA','YAPE','PLIN','CREDITO'] as const;
  if (!data || !Number.isFinite(Number(data.cantidadVentas)) || !Number.isFinite(Number(data.totalVentas))
    || !Number.isFinite(Number(data.efectivoEsperado)) || !data.porMetodo
    || methods.some((method) => !Number.isFinite(Number(data.porMetodo[method])))) {
    throw new Error('Supabase devolvió un resumen de caja inválido.');
  }
  return {
    cantidadVentas: Number(data.cantidadVentas), totalVentas: Number(data.totalVentas),
    totalDevoluciones: Number(data.totalDevoluciones || 0),
    porMetodo: Object.fromEntries(methods.map((method) => [method, Number(data.porMetodo[method])])) as SupabaseCashSummary['porMetodo'],
    efectivoEsperado: Number(data.efectivoEsperado),
  };
}


function authHeaders() {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para gestionar caja.');
  return { Authorization: `Bearer ${token}` };
}

export async function openSupabaseCash(sucursalId: number, saldoInicial: number): Promise<any> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0 || !Number.isFinite(saldoInicial) || saldoInicial < 0) throw new Error('Los datos de apertura no son válidos.');
  const response = await axios.post('/api/edge/cash/open', { sucursalId, saldoInicial }, { headers: authHeaders(), timeout: 20000 });
  if (!response.data || !Number.isSafeInteger(Number(response.data.id))) throw new Error('Supabase no confirmó la apertura de caja.');
  return response.data;
}

export async function registerSupabaseCashMovement(payload: { cajaId:number; tipo:'INGRESO'|'SALIDA'; metodoPago:'EFECTIVO'|'TARJETA'|'YAPE'|'PLIN'; monto:number; motivo:string }): Promise<any> {
  if (!Number.isSafeInteger(payload.cajaId) || payload.cajaId <= 0 || !Number.isFinite(payload.monto) || payload.monto <= 0 || payload.motivo.trim().length < 5) throw new Error('Los datos del movimiento no son válidos.');
  const response = await axios.post('/api/edge/cash/movement', payload, { headers: authHeaders(), timeout: 20000 });
  if (!response.data || response.data.ok !== true) throw new Error('Supabase no confirmó el movimiento de caja.');
  return response.data;
}

export async function closeSupabaseCash(payload: { cajaId:number; efectivoContado:number; arqueo?:any[] }): Promise<any> {
  if (!Number.isSafeInteger(payload.cajaId) || payload.cajaId <= 0 || !Number.isFinite(payload.efectivoContado) || payload.efectivoContado < 0) throw new Error('Los datos del cierre no son válidos.');
  const response = await axios.post('/api/edge/cash/close', { ...payload, arqueo: payload.arqueo || [] }, { headers: authHeaders(), timeout: 25000 });
  if (!response.data || response.data.ok !== true) throw new Error('Supabase no confirmó el cierre de caja.');
  return response.data;
}


export type SupabaseCashMovement = {
  id: number;
  tipo: 'INGRESO'|'SALIDA';
  metodoPago: 'EFECTIVO'|'TARJETA'|'YAPE'|'PLIN';
  monto: number;
  motivo: string;
  createdAt: string;
};

export async function fetchSupabaseCashMovements(cajaId: number): Promise<SupabaseCashMovement[]> {
  if (!Number.isSafeInteger(cajaId) || cajaId <= 0) throw new Error('Selecciona una caja válida.');
  const response = await axios.get('/api/edge/cash/movements', {
    headers: authHeaders(), params: { cajaId }, timeout: 15000,
  });
  if (!Array.isArray(response.data)) throw new Error('Supabase devolvió un historial de movimientos inválido.');
  return response.data.map((item: any) => {
    const id = Number(item?.id), monto = Number(item?.monto);
    if (!Number.isSafeInteger(id) || id === 0 || !['INGRESO','SALIDA'].includes(item?.tipo)
      || !['EFECTIVO','TARJETA','YAPE','PLIN'].includes(item?.metodoPago)
      || !Number.isFinite(monto) || typeof item?.motivo !== 'string' || typeof item?.createdAt !== 'string') {
      throw new Error('Supabase devolvió un movimiento de caja inválido.');
    }
    return { id, tipo: item.tipo, metodoPago: item.metodoPago, monto, motivo: item.motivo, createdAt: item.createdAt };
  });
}
