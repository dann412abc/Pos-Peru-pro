import axios from 'axios';
import { getAccessToken } from './client';

const EDGE = '/api/edge';
export interface CatalogBase {
  empresa_id: number;
  sucursal_id: number;
  sucursales: Array<{ id: number; nombre: string }>;
  categorias: Array<{ id: number; nombre: string; activo: boolean }>;
  productos: Array<Record<string, unknown>>;
  variantes: Array<Record<string, unknown>>;
  stock: Array<Record<string, unknown>>;
  stock_variantes?: Array<Record<string, unknown>>;
  clientes: Array<Record<string, unknown>>;
  proveedores?: Array<Record<string, unknown>>;
}

/** Descarga el catálogo visible para la identidad Supabase y sucursal autorizada. */
export async function fetchSupabaseCatalog(accessToken: string, sucursalId?: number): Promise<CatalogBase> {
  if (!accessToken) throw new Error('La sesión Supabase es obligatoria.');
  if (sucursalId !== undefined && (!Number.isSafeInteger(sucursalId) || sucursalId <= 0)) {
    throw new Error('La sucursal seleccionada no es válida.');
  }
  const response = await axios.get(`${EDGE}/catalog/base`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: sucursalId === undefined ? {} : { sucursal_id: sucursalId },
    timeout: 20000,
  });
  const data = response.data;
  if (!data || !Array.isArray(data.sucursales) || !Array.isArray(data.productos) || !Array.isArray(data.categorias)) {
    throw new Error('Supabase devolvió un catálogo incompleto.');
  }
  return data as CatalogBase;
}


/** Obtiene el catálogo usando la sesión Supabase actualmente guardada. */
export async function fetchCurrentSupabaseCatalog(sucursalId?: number): Promise<CatalogBase> {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para consultar el catálogo remoto.');
  return fetchSupabaseCatalog(token, sucursalId);
}

/** Normaliza nombres snake_case/camelCase devueltos por PostgreSQL/PostgREST. */
export function mapSupabaseProductRows(catalog: CatalogBase): Array<Record<string, any>> {
  const stockByProduct = new Map<number, number>();
  for (const row of catalog.stock || []) {
    const id = Number(row.producto_id ?? row.productoId);
    const quantity = Number(row.stock_actual ?? row.stock ?? row.cantidad ?? 0);
    if (Number.isSafeInteger(id)) stockByProduct.set(id, (stockByProduct.get(id) || 0) + (Number.isFinite(quantity) ? quantity : 0));
  }
  const categories = new Map((catalog.categorias || []).map((c: any) => [Number(c.id), c.nombre]));
  return (catalog.productos || []).map((p: any) => ({
    id: Number(p.id), codigo: String(p.codigo ?? ''), codigoBarras: p.codigo_barras ?? p.codigoBarras ?? null,
    tieneVariantes: Boolean(p.tiene_variantes ?? p.tieneVariantes), nombre: String(p.nombre ?? ''),
    categoria: String(p.categoria?.nombre ?? categories.get(Number(p.categoria_id ?? p.categoriaId)) ?? 'General'),
    unidad: String(p.unidad ?? 'UND'), precio: Number(p.precio ?? 0),
    precioMayoreo: p.precio_mayoreo == null && p.precioMayoreo == null ? undefined : Number(p.precio_mayoreo ?? p.precioMayoreo),
    stock: stockByProduct.get(Number(p.id)) ?? Number(p.stock ?? 0),
    costoPromedio: Number((catalog.stock || []).find((r: any) => Number(r.producto_id ?? r.productoId) === Number(p.id))?.costo_promedio ?? p.costo_promedio ?? 0),
    stockMinimo: Number(p.stock_minimo ?? p.stockMinimo ?? 0), tipoIgv: String(p.tipo_igv ?? p.tipoIgv ?? '10'),
    activo: Boolean(p.activo ?? true), createdAt: p.created_at ?? p.createdAt,
  }));
}

export function mapSupabaseCustomerRows(catalog: CatalogBase): Array<Record<string, any>> {
  return (catalog.clientes || []).filter((c: any) => c.activo !== false).map((c: any) => ({
    id: Number(c.id), tipoDoc: String(c.tipo_doc ?? c.tipoDoc ?? 'DNI').toUpperCase() === 'RUC' ? 'RUC' : 'DNI',
    numero: String(c.numero_documento ?? c.numero ?? c.documento ?? ''), nombre: String(c.nombre ?? ''),
    direccion: c.direccion ?? undefined, telefono: c.telefono ?? undefined, email: c.email ?? undefined,
    limiteCredito: Number(c.limite_credito ?? c.limiteCredito ?? 0), saldoCredito: Number(c.saldo_credito ?? c.saldoCredito ?? 0),
    createdAt: c.created_at ?? c.createdAt,
  }));
}


export type CatalogMutationAction = 'product_create' | 'product_update' | 'product_deactivate' | 'category_create' | 'category_update' | 'category_deactivate';
/** Escritura de catálogo mediante RPC transaccional. La empresa/usuario nunca vienen del cliente. */
export async function mutateSupabaseCatalog(action: CatalogMutationAction, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para modificar el catálogo remoto.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Los datos del catálogo no son válidos.');
  const response = await axios.post(`${EDGE}/catalog/mutate`, { action, payload }, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
  });
  if (!response.data || typeof response.data !== 'object') throw new Error('Supabase devolvió una respuesta de catálogo inválida.');
  return response.data;
}


export type VariantMutationAction = 'variant_create' | 'variant_update' | 'variant_deactivate';
/** CRUD de presentaciones/variantes; no altera existencias, que requieren movimientos auditables. */
export async function mutateSupabaseVariant(action: VariantMutationAction, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para modificar presentaciones.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Los datos de la presentación no son válidos.');
  const response = await axios.post(`${EDGE}/catalog/variant-mutate`, { action, payload }, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
  });
  if (!response.data || typeof response.data !== 'object') throw new Error('Supabase devolvió una respuesta de presentación inválida.');
  return response.data;
}


export function mapSupabaseSupplierRows(catalog: CatalogBase): Array<Record<string, any>> {
  return (catalog.proveedores || []).map((p: any) => ({
    id: Number(p.id), tipoDoc: String(p.tipo_doc ?? p.tipoDoc ?? 'RUC').toUpperCase(),
    numero: String(p.numero ?? ''), nombre: String(p.nombre ?? ''),
    direccion: p.direccion ?? undefined, telefono: p.telefono ?? undefined,
    email: p.email ?? undefined, contacto: p.contacto ?? undefined,
    activo: Boolean(p.activo ?? true),
  }));
}


/** Presentaciones activas y stock/costo de la sucursal elegida para formular compras. */
export function mapSupabasePurchaseVariants(catalog: CatalogBase, productoId: number): Array<Record<string, any>> {
  const stockRows = catalog.stock_variantes || [];
  return (catalog.variantes || []).filter((v: any) =>
    Number(v.producto_id ?? v.productoId) === productoId && v.activo !== false
  ).map((v: any) => {
    const stock = stockRows.find((x: any) => Number(x.variante_id ?? x.varianteId) === Number(v.id));
    return {
      id: Number(v.id),
      productoId: Number(v.producto_id ?? v.productoId),
      codigo: String(v.codigo ?? ''),
      nombre: String(v.nombre ?? ''),
      stock: Number(stock?.stock ?? 0),
      costoPromedio: Number(stock?.costo_promedio ?? 0),
      precio: Number(v.precio ?? 0),
      activo: Boolean(v.activo ?? true),
    };
  });
}
