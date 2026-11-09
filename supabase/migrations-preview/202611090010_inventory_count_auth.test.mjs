import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const migration = await readFile(new URL('supabase/migrations-preview/202611090010_inventory_count_auth.sql', root), 'utf8');
const edge = await readFile(new URL('frontend/functions/api/edge/[[path]].js', root), 'utf8');
const client = await readFile(new URL('frontend/src/api/supabaseInventory.ts', root), 'utf8');
const screen = await readFile(new URL('frontend/src/pages/ConteoFisico.tsx', root), 'utf8');

test('physical count migration creates protected header and line tables', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.inventario_conteo\s*\(/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.inventario_conteo_linea\s*\(/);
  assert.match(migration, /uq_inventario_conteo_abierto_sucursal/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});

test('physical count RPCs require auth and branch authorization', () => {
  for (const fn of ['pos_inventario_conteo_abrir_auth','pos_inventario_conteo_contar_auth','pos_inventario_conteo_cerrar_auth']) {
    assert.ok(migration.includes(fn));
  }
  assert.match(migration, /public\.mi_puede_ver_sucursal/);
  assert.match(migration, /public\.mi_rol\(\) IS DISTINCT FROM 'ADMIN'/);
});

test('closing applies each difference through the lot-aware adjustment RPC', () => {
  assert.match(migration, /public\.pos_inventario_ajustar_lote_auth\(jsonb_build_object/);
  assert.match(migration, /'COUNT-INV-'/);
  assert.match(migration, /estado='CERRADO'/);
});

test('edge exposes authenticated count routes', () => {
  for (const route of ['inventory/counts','inventory/counts/lines/count','pos_inventario_conteo_cerrar_auth']) {
    assert.ok(edge.includes(route));
  }
});

test('client and physical count screen use Supabase operations', () => {
  for (const fn of ['listarConteosFisicosSupabase','abrirConteoFisicoSupabase','detalleConteoFisicoSupabase','contarLineaFisicaSupabase','cerrarConteoFisicoSupabase']) {
    assert.ok(client.includes(fn));
    assert.ok(screen.includes(fn));
  }
});
