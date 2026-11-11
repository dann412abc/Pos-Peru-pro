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

test('catalog RPC rejects missing or unlinked authenticated identities before reading data', () => {
  assert.match(sql, /IF auth\.uid\(\) IS NULL OR v_usuario_id IS NULL OR v_empresa_id IS NULL THEN/);
  assert.match(sql, /ERRCODE = '42501'/);
});

test('catalog RPC resolves the default branch only from branches visible to the current user', () => {
  assert.match(sql, /WHERE s\.empresa_id = v_empresa_id\s+AND public\.mi_puede_ver_sucursal\(s\.id\)/);
  assert.match(sql, /ORDER BY s\.id\s+LIMIT 1/);
});

test('catalog RPC rejects a requested branch outside the authenticated company or permissions', () => {
  assert.match(sql, /IF public\.mi_puede_ver_sucursal\(p_sucursal_id\)/);
  assert.match(sql, /s\.id = p_sucursal_id AND s\.empresa_id = v_empresa_id/);
  assert.match(sql, /RAISE EXCEPTION 'Sucursal no autorizada para este usuario'/);
});

test('catalog response includes variants and their stock for the selected branch', () => {
  assert.match(sql, /'variantes', COALESCE/);
  assert.match(sql, /'stock_variantes', COALESCE/);
  assert.match(sql, /vs\.empresa_id = v_empresa_id AND vs\.sucursal_id = v_sucursal_id/);
});

test('catalog RPC does not accept a client-supplied company or user identity', () => {
  assert.match(sql, /v_usuario_id integer := public\.mi_usuario_id\(\)/);
  assert.match(sql, /v_empresa_id integer := public\.mi_empresa_id\(\)/);
  assert.doesNotMatch(sql, /p_empresa_id|p_usuario_id|supabase_auth_user_id/);
});
