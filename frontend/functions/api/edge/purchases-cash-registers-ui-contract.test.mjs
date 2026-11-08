import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const page = await readFile(new URL('../../../src/pages/Compras.tsx', import.meta.url), 'utf8');
const client = await readFile(new URL('../../../src/api/supabasePurchases.ts', import.meta.url), 'utf8');
test('Compras consulta cajas abiertas por la API Supabase en modo Supabase', () => {
  assert.match(page, /listarCajasAbiertasComprasSupabase\(sucursalId\)/);
  assert.match(page, /modoSupabase \? listarCajasAbiertasComprasSupabase/);
  assert.match(page, /api\.get\('\/compras\/cajas-abiertas'/);
});
test('cliente de cajas valida sucursal y respuesta antes de usarla', () => {
  assert.match(client, /export async function listarCajasAbiertasComprasSupabase/);
  assert.match(client, /purchases\/cash-registers/);
  assert.match(client, /Array\.isArray\(response\.data\?\.cajas\)/);
});
