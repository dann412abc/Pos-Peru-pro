import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('./202611100001_catalog_read_rpc_auth_user_id.sql', import.meta.url), 'utf8');

test('catalog read RPC resolves the current POS identity through the deployed auth_user_id helpers', () => {
  assert.match(sql, /public\.mi_usuario_id\(\)/);
  assert.match(sql, /public\.mi_empresa_id\(\)/);
  assert.match(sql, /public\.mi_puede_ver_sucursal\(p_sucursal_id\)/);
  assert.doesNotMatch(sql, /supabase_auth_user_id/);
});

test('catalog read RPC only returns products, stock and parties for the authenticated company and permitted branch', () => {
  assert.match(sql, /p\.empresa_id = v_empresa_id AND p\.activo = TRUE/);
  assert.match(sql, /ps\.empresa_id = v_empresa_id AND ps\.sucursal_id = v_sucursal_id/);
  assert.match(sql, /vs\.empresa_id = v_empresa_id AND vs\.sucursal_id = v_sucursal_id/);
  assert.match(sql, /public\.mi_puede_ver_sucursal\(s\.id\)/);
});

test('catalog read RPC matches the live client schema and does not filter clients by a nonexistent activo column', () => {
  assert.match(sql, /FROM public\.cliente c\s+WHERE c\.empresa_id = v_empresa_id/);
  assert.doesNotMatch(sql, /c\.activo/);
});

test('catalog read RPC grants execution only to authenticated users', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_catalogo_base_auth\(integer\) FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_catalogo_base_auth\(integer\) FROM anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_catalogo_base_auth\(integer\) TO authenticated/);
});
