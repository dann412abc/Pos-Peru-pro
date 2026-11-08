import axios from 'axios';
import { getAccessToken } from './client';

function authHeaders() {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para consultar devoluciones.');
  return { Authorization: `Bearer ${token}` };
}

export async function fetchSupabaseReturns(sucursalId?: number): Promise<any[]> {
  if (sucursalId !== undefined && (!Number.isSafeInteger(sucursalId) || sucursalId <= 0)) throw new Error('Selecciona una sucursal válida.');
  const response = await axios.get('/api/edge/returns/list', { headers: authHeaders(), params: sucursalId ? { sucursalId } : {}, timeout: 15000 });
  if (!Array.isArray(response.data)) throw new Error('Supabase devolvió un historial de devoluciones inválido.');
  return response.data;
}

export async function searchSupabaseReturnReceipts(termino: string, sucursalId?: number): Promise<any[]> {
  const q = String(termino || '').trim();
  if (q.length < 2 || q.length > 80) throw new Error('Escribe entre 2 y 80 caracteres para buscar.');
  const response = await axios.get('/api/edge/returns/search', { headers: authHeaders(), params: { q, ...(sucursalId ? { sucursalId } : {}) }, timeout: 15000 });
  if (!Array.isArray(response.data)) throw new Error('Supabase devolvió una búsqueda de comprobantes inválida.');
  return response.data;
}

export async function fetchSupabaseReturnAvailability(comprobanteId: number): Promise<any> {
  if (!Number.isSafeInteger(comprobanteId) || comprobanteId <= 0) throw new Error('Selecciona un comprobante válido.');
  const response = await axios.get('/api/edge/returns/availability', { headers: authHeaders(), params: { comprobanteId }, timeout: 15000 });
  const data = response.data;
  if (!data || !data.comprobante || !Array.isArray(data.lineas)) throw new Error('Supabase devolvió una disponibilidad de devolución inválida.');
  return data;
}


export interface SupabaseReturnPreflightPayload {
  motivo: string;
  idempotencyKey: string;
  lineas: Array<{ comprobanteLineaId: number; cantidad: number; reingresarStock: boolean }>;
  pagos: Array<{ metodoPago: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN'; monto: number; referencia?: string | null }>;
}

/**
 * Ejecuta únicamente la prevalidación SQL. Nunca registra la devolución.
 * La pantalla de registro permanece protegida hasta que exista el RPC de commit.
 */
export async function preflightSupabaseReturn(
  comprobanteId: number,
  payload: SupabaseReturnPreflightPayload,
): Promise<any> {
  if (!Number.isSafeInteger(comprobanteId) || comprobanteId <= 0) {
    throw new Error('Selecciona un comprobante válido.');
  }
  const motivo = String(payload?.motivo || '').trim();
  const key = String(payload?.idempotencyKey || '').trim();
  if (motivo.length < 5 || key.length < 8 || key.length > 100) {
    throw new Error('Indica un motivo y una clave de operación válidos.');
  }
  if (!Array.isArray(payload.lineas) || payload.lineas.length < 1 || payload.lineas.length > 100) {
    throw new Error('Selecciona entre 1 y 100 líneas para prevalidar.');
  }
  const response = await axios.post('/api/edge/rpc/pos_devolucion_prevalidar_auth', {
    p_comprobante_id: comprobanteId,
    p_payload: {
      motivo,
      idempotencyKey: key,
      lineas: payload.lineas,
      pagos: payload.pagos || [],
    },
  }, { headers: authHeaders(), timeout: 20000 });
  if (!response.data || response.data.ok !== true || response.data.duplicado === true) {
    throw new Error(response.data?.mensaje || 'No se pudo validar la devolución.');
  }
  if (response.data.mensaje && !String(response.data.mensaje).includes('No se ha registrado')) {
    throw new Error('La respuesta no confirma que esta operación fue solo una prevalidación.');
  }
  return response.data;
}


/**
 * Comprueba las tablas y columnas requeridas por la futura devolución transaccional.
 * Es una consulta de diagnóstico: no modifica datos y nunca habilita el registro.
 */
export async function verifySupabaseReturnsSchema(): Promise<any> {
  const response = await axios.post('/api/edge/rpc/pos_devolucion_esquema_verificar_auth', {}, {
    headers: authHeaders(),
    timeout: 20000,
  });
  const data = response.data;
  if (!data || typeof data.ok !== 'boolean' || !Array.isArray(data.faltantes)
      || data.puedeHabilitarRegistro !== false) {
    throw new Error('Supabase devolvió un diagnóstico de esquema inválido.');
  }
  return data;
}
