import axios from 'axios';
import { getAccessToken } from './client';

export type PartyAction = 'customer_create' | 'customer_update' | 'customer_deactivate' | 'supplier_create' | 'supplier_update' | 'supplier_deactivate';

/** Operaciones de clientes/proveedores en RPC transaccional; empresa y usuario nunca se envían desde el navegador. */
export async function mutateSupabaseParty(action: PartyAction, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para modificar clientes o proveedores.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Los datos del registro no son válidos.');
  const response = await axios.post('/api/edge/parties/mutate', { action, payload }, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 20000,
  });
  if (!response.data || typeof response.data !== 'object') throw new Error('Supabase devolvió una respuesta inválida.');
  return response.data;
}


/** Lista proveedores de la empresa asociada a la sesión; la empresa no se envía desde el navegador. */
export async function fetchSupabaseSuppliers(): Promise<Array<Record<string, any>>> {
  const token = getAccessToken();
  if (!token || token.startsWith('demo-')) throw new Error('Inicia sesión con Supabase para consultar proveedores.');
  const response = await axios.get('/api/edge/parties/suppliers', { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
  if (!Array.isArray(response.data)) throw new Error('Supabase devolvió una lista de proveedores inválida.');
  return response.data;
}
