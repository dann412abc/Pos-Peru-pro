import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../../../functions/api/edge/[[path]].js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../../../supabase/migrations-preview/202611100001_catalog_read_rpc_auth_user_id.sql', import.meta.url), 'utf8');
const client = await readFile(new URL('../../../src/api/supabaseCatalog.ts', import.meta.url), 'utf8');

test('catalog read edge route calls the exact authenticated SQL RPC and maps missing migration as 409', () => {
  assert.match(edge, /route === 'catalog\/base'/);
  assert.match(edge, /rpc\/pos_catalogo_base_auth/);
  assert.match(edge, /CATALOG_MIGRATION_REQUIRED/);
  assert.match(edge, /status: 409/);
});

test('catalog SQL response contains all collections consumed by the POS client', () => {
  for (const key of ['empresa_id', 'sucursal_id', 'sucursales', 'categorias', 'productos', 'variantes', 'stock', 'stock_variantes', 'clientes', 'proveedores']) {
    assert.match(migration, new RegExp("'" + key + "'"));
  }
  for (const key of ['sucursales', 'categorias', 'productos', 'variantes', 'stock', 'stock_variantes', 'clientes', 'proveedores']) {
    assert.match(client, new RegExp(key));
  }
});

test('catalog SQL derives identity and company from Supabase auth helpers, never from client payload', () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /public\.mi_usuario_id\(\)/);
  assert.match(migration, /public\.mi_empresa_id\(\)/);
  assert.match(migration, /public\.mi_puede_ver_sucursal\(p_sucursal_id\)/);
  assert.doesNotMatch(migration, /p_empresa_id|p_usuario_id|supabase_auth_user_id/);
});
