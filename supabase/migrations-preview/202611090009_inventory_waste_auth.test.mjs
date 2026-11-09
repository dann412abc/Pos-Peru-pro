import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('./202611090009_inventory_waste_auth.sql', import.meta.url), 'utf8');
const router = await readFile(new URL('../../frontend/functions/api/edge/[[path]].js', import.meta.url), 'utf8');
const client = await readFile(new URL('../../frontend/src/api/supabaseInventory.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../../frontend/src/pages/Mermas.tsx', import.meta.url), 'utf8');

test('merma Supabase valida identidad, sucursal, motivo y usa el escritor FEFO autenticado', () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /mi_puede_ver_sucursal/);
  assert.match(migration, /pos_inventario_ajustar_lote_auth/);
  assert.match(migration, /'SALIDA'/);
  assert.match(migration, /idempotency_key/);
  assert.match(migration, /pos_inventario_mermas_listar_auth/);
  assert.match(migration, /pos_inventario_lotes_merma_auth/);
});

test('Edge expone lectura de lotes/historial y registro de mermas con Bearer', () => {
  assert.match(router, /inventory\/waste\/lots/);
  assert.match(router, /inventory\/waste\/history/);
  assert.match(router, /inventory\/waste'/);
  assert.match(router, /pos_inventario_merma_registrar_auth/);
});

test('cliente y pantalla usan Supabase y conservan la clave para reintentos', () => {
  assert.match(client, /registrarMermaSupabase/);
  assert.match(client, /listarLotesMermaSupabase/);
  assert.match(page, /registrarMermaSupabase/);
  assert.match(page, /setMermaKey\(crypto\.randomUUID\(\)\)/);
});
