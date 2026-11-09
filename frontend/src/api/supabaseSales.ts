import type { Venta } from '../types';
import axios from 'axios';
import { getAccessToken } from './client';

export type SupabaseSalePayload = {
  sucursalId: number;
  clienteId: number;
  tipo: '01' | '03';
  pagos: Array<{ metodo: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN' | 'CREDITO'; monto: number; montoRecibido?: number }>;
  fechaVencimiento?: string;
  motivoDescuento?: string;
  descuentoGlobal: number;
  lineas: Array<{ productoId: number; varianteId?: number; cantidad: number; precioUnitario: number; descuento: number }>;
  idempotencyKey: string;
};

export type SupabaseSaleResult = {
  ok: true;
  decision: string;
  comprobanteId: number;
  tipo?: string;
  serie: string;
  correlativo: number;
  total: number;
  idempotentReplay?: boolean;
};

function authHeaders() {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para registrar ventas.');
  return { Authorization: `Bearer ${token}` };
}

export type SupabaseSaleRecovery = {
  ok: true;
  existente: boolean;
  decision: string;
  comprobanteId?: number;
  tipo?: string;
  serie?: string;
  correlativo?: number;
  total?: number;
  estado?: string;
  pagos?: Array<{ metodo: string; monto: number }>;
  idempotentReplay?: boolean;
};

export async function consultarEstadoVentaSupabase(payload: SupabaseSalePayload): Promise<SupabaseSaleRecovery> {
  const response = await axios.post('/api/edge/sales/idempotency-check', { payload }, {
    headers: authHeaders(),
    timeout: 20000,
  });
  const result = response.data;
  if (!result || result.ok !== true || typeof result.existente !== 'boolean') {
    throw new Error('Supabase no devolvió un estado verificable para esta venta.');
  }
  if (result.existente && (!Number.isSafeInteger(Number(result.comprobanteId)) ||
      Number(result.comprobanteId) <= 0 || !result.serie ||
      !Number.isSafeInteger(Number(result.correlativo)))) {
    throw new Error('Se encontró una venta, pero sus datos de comprobante están incompletos. Requiere revisión.');
  }
  return result;
}


/** Recupera el detalle oficial del comprobante desde Supabase. La RPC aplica el scope
 * de empresa y sucursales a partir de auth.uid(); el navegador solo aporta el ID. */
export async function consultarDetalleComprobanteSupabase(comprobanteId: number): Promise<Record<string, any>> {
  if (!Number.isSafeInteger(comprobanteId) || comprobanteId <= 0) {
    throw new Error('El identificador del comprobante no es válido.');
  }
  const response = await axios.post('/api/edge/sales/comprobante-detail', { comprobanteId }, {
    headers: authHeaders(), timeout: 20000,
  });
  const result = response.data;
  if (!result || Number(result.id) !== comprobanteId || !result.cliente ||
      !Array.isArray(result.lineas) || !Array.isArray(result.pagos) ||
      !Number.isFinite(Number(result.total)) || !result.serie ||
      !Number.isSafeInteger(Number(result.correlativo))) {
    throw new Error('Supabase devolvió un detalle de comprobante incompleto. El intento pendiente se conserva.');
  }
  return result;
}

function convertirRecuperacion(result: SupabaseSaleRecovery): SupabaseSaleResult {
  if (!result.existente) throw new Error('La venta aún no aparece confirmada. Conserva el carrito y reintenta con la misma clave.');
  return {
    ok: true,
    decision: String(result.decision || 'SALE_CONFIRMED'),
    comprobanteId: Number(result.comprobanteId),
    tipo: result.tipo == null ? undefined : String(result.tipo),
    serie: String(result.serie),
    correlativo: Number(result.correlativo),
    total: Number(result.total || 0),
    idempotentReplay: true,
  };
}

/**
 * Ejecuta una única RPC transaccional. No hay fallback a NestJS ni a la cola offline:
 * una respuesta ambigua conserva el carrito y la misma clave para permitir replay seguro.
 * Nunca deriva a NestJS ni a una cola offline; tras timeout consulta la clave original.
 */
export async function crearVentaSupabase(payload: SupabaseSalePayload): Promise<SupabaseSaleResult> {
  if (!Number.isSafeInteger(payload.sucursalId) || payload.sucursalId <= 0 ||
      !Number.isSafeInteger(payload.clienteId) || payload.clienteId <= 0 ||
      !['01', '03'].includes(payload.tipo) || !payload.idempotencyKey ||
      !Array.isArray(payload.lineas) || payload.lineas.length < 1 ||
      !Array.isArray(payload.pagos) || payload.pagos.length < 1) {
    throw new Error('La venta no contiene una sucursal, cliente, comprobante, líneas, pagos o clave de seguridad válidos.');
  }
  if (payload.lineas.some((linea) => !Number.isSafeInteger(linea.productoId) || linea.productoId <= 0 ||
      !Number.isFinite(linea.cantidad) || linea.cantidad <= 0 ||
      (linea.varianteId !== undefined && (!Number.isSafeInteger(linea.varianteId) || linea.varianteId <= 0)))) {
    throw new Error('Una o más líneas de venta contienen productos, variantes o cantidades inválidas.');
  }
  if (payload.pagos.some((pago) => !Number.isFinite(pago.monto) || pago.monto <= 0)) {
    throw new Error('Los importes de los medios de pago no son válidos.');
  }

  try {
    const response = await axios.post('/api/edge/rpc/pos_venta_crear_auth', { p_payload: payload }, {
      headers: authHeaders(),
      timeout: 45000,
    });
    const result = response.data;
    if (!result || result.ok !== true || !Number.isSafeInteger(Number(result.comprobanteId)) ||
        Number(result.comprobanteId) <= 0 || !result.serie || !Number.isSafeInteger(Number(result.correlativo))) {
      throw new Error('Supabase no devolvió una confirmación completa de la venta. El carrito se conserva para reintentar con la misma clave.');
    }
    return {
      ok: true,
      decision: String(result.decision || ''),
      comprobanteId: Number(result.comprobanteId),
      tipo: result.tipo == null ? undefined : String(result.tipo),
      serie: String(result.serie),
      correlativo: Number(result.correlativo),
      total: Number(result.total || 0),
      idempotentReplay: Boolean(result.idempotentReplay),
    };
  } catch (error: any) {
    const status = error?.response?.status;
    const message = error?.response?.data?.message || error?.response?.data?.details ||
      error?.response?.data?.hint || error?.response?.data?.error_description;
    if (status === 401) throw new Error('La sesión Supabase expiró. Inicia sesión nuevamente; conserva el carrito.');
    if (status === 403) throw new Error('La RPC de ventas no está habilitada en Cloudflare. No se registró una venta por otra vía.');
    if (status === 404 || status === 409) throw new Error('La función transaccional de ventas aún no está instalada en el entorno Supabase de pruebas.');
    if (status >= 400 && status < 500) throw new Error(String(message || 'Supabase rechazó la venta. Revisa los datos; el carrito se conserva.'));

    // Si la respuesta de creación fue ambigua (timeout, corte de red o 5xx),
    // consultar el estado con la MISMA carga y clave. Nunca crear una segunda clave.
    try {
      const recovery = await consultarEstadoVentaSupabase(payload);
      if (recovery.existente) return convertirRecuperacion(recovery);
    } catch (recoveryError: any) {
      if (recoveryError?.response?.status === 401) {
        throw new Error('La sesión expiró y no se pudo verificar el cobro. Conserva el carrito; inicia sesión y verifica nuevamente.');
      }
      if (recoveryError?.response?.status === 409) {
        throw new Error('La consulta de recuperación aún no está instalada en Supabase. Conserva el carrito y reintenta con la misma clave.');
      }
    }
    if (error instanceof Error && !axios.isAxiosError(error)) throw error;
    throw new Error('No se pudo confirmar el resultado del cobro. La consulta no encontró un comprobante confirmado; la solicitud podría seguir en curso. Conserva el carrito y reintenta con la misma clave.');
  }
}

function claveDeterministaFallback(fingerprint: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < fingerprint.length; i += 1) {
    const code = fingerprint.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `sale-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

export type IntentoVentaPendienteSupabase = {
  version: 1;
  storageKey: string;
  fingerprint: string;
  idempotencyKey: string;
  payload: SupabaseSalePayload;
  createdAt: string;
  updatedAt: string;
  ticketSnapshot?: Venta;
};

function nombreClave(storageKey: string): string {
  return `micarrito:sale-idempotency:${storageKey}`;
}
function nombreIntento(storageKey: string): string {
  return `micarrito:sale-pending-attempt:${storageKey}`;
}

/** Clave persistente entre recargas y reinicios del navegador. Un intento ambiguo
 * bloquea cualquier carrito distinto hasta resolverlo; nunca se sobrescribe. */
export function obtenerClaveVentaSupabase(storageKey: string, fingerprint: string): string {
  const fallback = claveDeterministaFallback(`${storageKey}:${fingerprint}`);
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const pending = JSON.parse(localStorage.getItem(nombreIntento(storageKey)) || 'null') as IntentoVentaPendienteSupabase | null;
    if (pending) {
      if (pending.fingerprint !== fingerprint) {
        throw new Error('Existe un cobro anterior pendiente de verificar. Recupera esa operación antes de modificar o cobrar otro carrito.');
      }
      return pending.idempotencyKey;
    }
    const current = JSON.parse(localStorage.getItem(nombreClave(storageKey)) || 'null');
    if (current?.fingerprint === fingerprint && typeof current.key === 'string' && current.key) return current.key;
    const key = `sale-${typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : fallback.slice(5)}`;
    localStorage.setItem(nombreClave(storageKey), JSON.stringify({ fingerprint, key }));
    return key;
  } catch (error) {
    if (error instanceof Error && error.message.includes('cobro anterior pendiente')) throw error;
    // Almacenamiento bloqueado: clave determinista para reintentos idénticos.
    return fallback;
  }
}

/** Guarda el snapshot exacto antes de contactar al servidor. No almacena tokens. */
export function guardarIntentoVentaPendienteSupabase(
  storageKey: string, fingerprint: string, payload: SupabaseSalePayload, ticketSnapshot?: Venta,
): void {
  if (typeof localStorage === 'undefined') throw new Error('No se puede garantizar la recuperación del cobro: almacenamiento local no disponible.');
  const current = JSON.parse(localStorage.getItem(nombreIntento(storageKey)) || 'null') as IntentoVentaPendienteSupabase | null;
  if (current && (current.fingerprint !== fingerprint || current.idempotencyKey !== payload.idempotencyKey)) {
    throw new Error('Hay otro cobro pendiente de verificar. No se enviará una segunda venta.');
  }
  const now = new Date().toISOString();
  const record: IntentoVentaPendienteSupabase = current || {
    version: 1, storageKey, fingerprint, idempotencyKey: payload.idempotencyKey,
    payload: JSON.parse(JSON.stringify(payload)), createdAt: now, updatedAt: now,
  };
  record.updatedAt = now;
  if (!record.ticketSnapshot && ticketSnapshot) record.ticketSnapshot = JSON.parse(JSON.stringify(ticketSnapshot));
  localStorage.setItem(nombreIntento(storageKey), JSON.stringify(record));
}

export function obtenerIntentoVentaPendienteSupabase(storageKey: string): IntentoVentaPendienteSupabase | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const value = JSON.parse(localStorage.getItem(nombreIntento(storageKey)) || 'null');
    if (!value || value.version !== 1 || value.storageKey !== storageKey ||
        !value.fingerprint || !value.idempotencyKey || !value.payload ||
        value.payload.idempotencyKey !== value.idempotencyKey) return null;
    return value as IntentoVentaPendienteSupabase;
  } catch { return null; }
}

/** Solo se llama tras confirmación completa o rechazo definitivo verificado. */
export function limpiarClaveVentaSupabase(storageKey: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(nombreClave(storageKey));
    localStorage.removeItem(nombreIntento(storageKey));
  }
}
