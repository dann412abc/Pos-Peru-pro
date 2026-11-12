import axios from 'axios';
import { getAccessToken } from './client';
import { fetchCurrentSupabaseCatalog, mapSupabaseProductRows, mapSupabasePurchaseVariants } from './supabaseCatalog';

export type SupabasePurchasePayload = {
  sucursalId: number; proveedorId: number; tipoDocumento: string; serie: string; numero: string;
  fechaDocumento: string; condicionPago: 'CONTADO' | 'CREDITO'; fechaVencimiento?: string;
  idempotencyKey: string;
  lineas: Array<{ productoId: number; varianteId?: number; cantidad: number; unidadCompra: string;
    unidadesPorEmpaque: number; costoEmpaque: number; costoUnitario: number; tipoIgv: number;
    cantidadEmpaques?: number; codigoLote?: string; fechaVencimiento?: string }>;
  pagos: Array<{ metodoPago: 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA' | 'TRANSFERENCIA';
    monto: number; cajaId?: number; referencia?: string }>;
};

function rethrowInventoryCountConflict(error: any): void {
  const data = error?.response?.data;
  const message = [data?.message, data?.details, data?.hint, data?.error, data?.error_description]
    .filter(value => typeof value === 'string').join(' ');
  if (data?.error === 'INVENTORY_COUNT_OPEN' || message.includes('INVENTORY_COUNT_OPEN')) {
    throw new Error('Hay un inventario físico abierto en esta sucursal. Cierra el conteo antes de recibir o devolver compras; conserva la misma clave para reintentar.');
  }
}

function authHeaders() {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para consultar compras.');
  return { Authorization: `Bearer ${token}` };
}

/** Cajas abiertas del usuario autenticado en una sucursal autorizada. */
export async function listarCajasAbiertasComprasSupabase(sucursalId: number): Promise<Array<{ id:number; saldoInicial:number; fechaApertura?:string }>> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('Selecciona una sucursal válida.');
  const response = await axios.get('/api/edge/purchases/cash-registers', { headers: authHeaders(), params: { sucursalId }, timeout: 15000 });
  if (!Array.isArray(response.data?.cajas)) throw new Error('Supabase devolvió una lista de cajas inválida.');
  return response.data.cajas.map((c:any) => ({ id:Number(c.id), saldoInicial:Number(c.saldoInicial || 0), fechaApertura:c.fechaApertura }))
    .filter((c:any) => Number.isSafeInteger(c.id) && c.id > 0);
}

/** Análisis de proveedores y precios limitado a la sucursal autorizada. */
export async function fetchSupabaseSupplierAnalytics(sucursalId: number): Promise<{proveedores:any[]; preciosRecientes:any[]; comparacionCostos:any[]}> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('Selecciona una sucursal válida.');
  const response = await axios.get('/api/edge/purchases/supplier-analytics', { headers: authHeaders(), params: { sucursalId }, timeout: 20000 });
  const data = response.data;
  if (!data || !Array.isArray(data.proveedores) || !Array.isArray(data.preciosRecientes) || !Array.isArray(data.comparacionCostos)) {
    throw new Error('Supabase devolvió un análisis de proveedores inválido.');
  }
  return data;
}

/** Historial de compras de una sucursal autorizada por la RPC. */
export async function fetchSupabasePurchases(sucursalId: number): Promise<any[]> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('Selecciona una sucursal válida.');
  const response = await axios.get('/api/edge/purchases', { headers: authHeaders(), params: { sucursalId }, timeout: 20000 });
  if (!response.data || !Array.isArray(response.data.compras)) throw new Error('Supabase devolvió un historial de compras inválido.');
  return response.data.compras;
}

/** Detalle de compra limitado a la empresa y sucursal de la sesión. */
export async function fetchSupabasePurchaseDetail(sucursalId: number, compraId: number): Promise<any> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0 || !Number.isSafeInteger(compraId) || compraId <= 0) throw new Error('La compra o sucursal no es válida.');
  const response = await axios.get('/api/edge/purchases', { headers: authHeaders(), params: { sucursalId, compraId }, timeout: 20000 });
  if (!response.data?.detalle || Number(response.data.detalle.id) !== compraId) throw new Error('No se encontró el detalle de la compra.');
  return response.data.detalle;
}

/** Llama a la RPC que registra compra, inventario, lotes, costos y pagos en una transacción. */
export async function recibirCompraSupabase(payload: SupabasePurchasePayload): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  if (!payload || !Array.isArray(payload.lineas) || !payload.lineas.length || !payload.idempotencyKey) throw new Error('La compra no cumple los datos mínimos para su recepción.');
  let response;
  try { response = await axios.post('/api/edge/purchases/receive', { payload }, { headers, timeout: 30000 }); } catch (error) { rethrowInventoryCountConflict(error); throw error; }
  if (!response.data || typeof response.data !== 'object') throw new Error('Supabase devolvió una respuesta de compra inválida.');
  return response.data;
}

/** Registra un abono a proveedor con idempotencia y actualización atómica de caja/saldo. */
export async function registrarPagoCompraSupabase(payload: {
  compraId: number; monto: number; metodoPago: 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA' | 'TRANSFERENCIA';
  cajaId?: number; referencia?: string; idempotencyKey: string;
}): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  if (!Number.isSafeInteger(payload.compraId) || payload.compraId <= 0 || !Number.isFinite(payload.monto) || payload.monto <= 0 || !payload.idempotencyKey) {
    throw new Error('Los datos del pago no son válidos.');
  }
  const response = await axios.post('/api/edge/purchases/payment', { payload }, { headers, timeout: 30000 });
  if (!response.data || typeof response.data !== 'object') throw new Error('Supabase devolvió una respuesta de pago inválida.');
  return response.data;
}

/** Solo prevalidación: NO descuenta stock ni registra devoluciones. */
export async function prevalidarDevolucionProveedorSupabase(payload: {
  compraId: number;
  lineas: Array<{ compraLineaId: number; loteId: number; cantidad: number }>;
}): Promise<{ valida: boolean; totalEstimado: number; saldoAplicable: number; saldoFavorEstimado: number }> {
  if (!Number.isSafeInteger(payload.compraId) || payload.compraId <= 0 || !payload.lineas?.length) throw new Error('Datos de devolución inválidos.');
  const response = await axios.post('/api/edge/purchases/return-preview', { payload }, { headers: authHeaders(), timeout: 20000 });
  if (typeof response.data?.valida !== 'boolean') throw new Error('Respuesta de prevalidación inválida.');
  return response.data;
}


/** Registra la devolución al proveedor; inventario, lotes y saldo se revierten juntos si falla. */
export async function registrarDevolucionProveedorSupabase(payload: {
  compraId: number; motivo: string; idempotencyKey: string;
  lineas: Array<{ compraLineaId: number; cantidad: number }>;
}): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  if (!Number.isSafeInteger(payload.compraId) || payload.compraId <= 0 || payload.motivo.trim().length < 5 ||
      !payload.idempotencyKey || !payload.lineas?.length || payload.lineas.some(x => !Number.isSafeInteger(x.compraLineaId) || x.compraLineaId <= 0 || !Number.isFinite(x.cantidad) || x.cantidad <= 0)) {
    throw new Error('Los datos de la devolución no son válidos.');
  }
  let response;
  try { response = await axios.post('/api/edge/purchases/return', { payload }, { headers, timeout: 30000 }); } catch (error) { rethrowInventoryCountConflict(error); throw error; }
  if (!response.data || typeof response.data !== 'object' || !response.data.devolucionId) throw new Error('Supabase no confirmó la devolución.');
  return response.data;
}

/** Anula una compra solo si la RPC confirma que no tiene pagos/devoluciones y el stock sigue intacto. */
export async function anularCompraSupabase(payload: { compraId: number; motivo: string }): Promise<Record<string, unknown>> {
  const headers = authHeaders();
  if (!Number.isSafeInteger(payload.compraId) || payload.compraId <= 0 || payload.motivo.trim().length < 5 || payload.motivo.length > 500) {
    throw new Error('La compra o el motivo de anulación no son válidos.');
  }
  let response;
  try { response = await axios.post('/api/edge/purchases/cancel', { payload }, { headers, timeout: 30000 }); } catch (error) { rethrowInventoryCountConflict(error); throw error; }
  if (!response.data || response.data.estado !== 'ANULADA') throw new Error('Supabase no confirmó la anulación de la compra.');
  return response.data;
}


/** Órdenes de compra y recepciones parciales, todas autorizadas por la sesión Supabase. */
export async function listarOrdenesCompraSupabase(sucursalId: number): Promise<any[]> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('Selecciona una sucursal válida.');
  const response = await axios.get('/api/edge/purchases/orders', { headers: authHeaders(), params: { sucursalId }, timeout: 20000 });
  if (!Array.isArray(response.data?.ordenes)) throw new Error('Respuesta de órdenes inválida.');
  return response.data.ordenes;
}
export async function obtenerOrdenCompraSupabase(ordenId: number): Promise<any> {
  if (!Number.isSafeInteger(ordenId) || ordenId <= 0) throw new Error('Orden inválida.');
  const response = await axios.get('/api/edge/purchases/orders', { headers: authHeaders(), params: { ordenId }, timeout: 20000 });
  if (!response.data?.orden || Number(response.data.orden.id) !== ordenId) throw new Error('No se encontró la orden.');
  return response.data.orden;
}
export async function crearOrdenCompraSupabase(payload: { sucursalId:number; proveedorId:number; observaciones?:string; fechaEntregaEsperada?:string; lineas:any[] }): Promise<any> {
  if (!payload.lineas?.length) throw new Error('Agrega al menos un producto a la orden.');
  const response = await axios.post('/api/edge/purchases/orders', { action:'create', payload }, { headers:authHeaders(), timeout:30000 });
  if (!response.data?.orden?.id) throw new Error('Supabase no confirmó la creación de la orden.');
  return response.data.orden;
}
export async function cambiarEstadoOrdenCompraSupabase(ordenId:number, accion:'send'|'cancel'): Promise<any> {
  const response = await axios.post('/api/edge/purchases/orders', { action:accion, payload:{ordenId} }, { headers:authHeaders(), timeout:20000 });
  if (!response.data?.orden?.id) throw new Error('Supabase no confirmó el cambio de estado.');
  return response.data.orden;
}
export async function recepcionarOrdenCompraSupabase(payload:any): Promise<any> {
  if (!Number.isSafeInteger(payload?.ordenId) || !payload.idempotencyKey || !Array.isArray(payload.lineas) || !payload.lineas.length) throw new Error('Datos de recepción parcial inválidos.');
  const response = await axios.post('/api/edge/purchases/orders', { action:'receive', payload }, { headers:authHeaders(), timeout:45000 });
  if (!response.data?.compraId) throw new Error('Supabase no confirmó la recepción de la orden.');
  return response.data;
}


/** Sugerencias de reposición calculadas por SQL con salidas reales y stock por variante. */
export async function fetchSupabasePurchaseReplenishment(sucursalId: number): Promise<any[]> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('Selecciona una sucursal válida.');
  const response = await axios.get('/api/edge/purchases/replenishment', { headers: authHeaders(), params: { sucursalId }, timeout: 20000 });
  if (!Array.isArray(response.data?.sugerencias)) throw new Error('Supabase devolvió sugerencias de reposición inválidas.');
  return response.data.sugerencias;
}


/** Lotes vencidos y próximos a vencer; consulta de solo lectura y limitada por RPC a la sucursal autorizada. */
export async function fetchSupabaseInventoryExpiries(sucursalId: number, dias: number): Promise<any[]> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0 || ![30, 60, 90, 180, 365].includes(dias)) {
    throw new Error('Sucursal o rango de vencimiento inválido.');
  }
  const response = await axios.get('/api/edge/inventory/expiries', {
    headers: authHeaders(), params: { sucursalId, dias }, timeout: 20000,
  });
  if (!Array.isArray(response.data?.lotes)) throw new Error('Supabase devolvió un control de vencimientos inválido.');
  return response.data.lotes.map((x: any) => ({
    ...x,
    id: Number(x.id), sucursalId: Number(x.sucursalId), productoId: Number(x.productoId),
    cantidadDisponible: Number(x.cantidadDisponible || 0), costoUnitario: Number(x.costoUnitario || 0),
    valorEnRiesgo: Number(x.valorEnRiesgo || 0), diasRestantes: Number(x.diasRestantes || 0),
  }));
}


/** Productos activos disponibles para registrar compras en una sucursal Supabase autorizada. */
export async function fetchSupabasePurchaseProducts(sucursalId: number): Promise<any[]> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0) throw new Error('Selecciona una sucursal válida.');
  const catalog = await fetchCurrentSupabaseCatalog(sucursalId);
  return mapSupabaseProductRows(catalog).filter((p: any) => p.activo !== false);
}

/** Variantes activas y su stock/costo por sucursal para el formulario de compras. */
export async function fetchSupabasePurchaseVariants(sucursalId: number, productoId: number): Promise<any[]> {
  if (!Number.isSafeInteger(sucursalId) || sucursalId <= 0 || !Number.isSafeInteger(productoId) || productoId <= 0) {
    throw new Error('El producto o la sucursal no son válidos.');
  }
  const catalog = await fetchCurrentSupabaseCatalog(sucursalId);
  return mapSupabasePurchaseVariants(catalog, productoId);
}
