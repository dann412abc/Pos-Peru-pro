import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sql = readFileSync(join(root, 'supabase/migrations-preview/202611070023_sales_context_auth_rpc.sql'), 'utf8');

test('contexto deriva identidad exclusivamente de auth.uid y vínculo Supabase', () => {
  assert.match(sql, /v_auth_user_id\s*:=\s*auth\.uid\(\)/i);
  assert.match(sql, /supabase_auth_user_id\s*=\s*v_auth_user_id/i);
  assert.match(sql, /u\.activo\s*=\s*TRUE/i);
  assert.doesNotMatch(sql, /p_payload\s*->>\s*'usuarioId'/i);
  assert.doesNotMatch(sql, /p_payload\s*->>\s*'empresaId'/i);
});

test('valida que sucursal pertenezca a empresa y esté asignada al usuario', () => {
  assert.match(sql, /s\.empresa_id\s*=\s*v_empresa_id/i);
  assert.match(sql, /us\.usuario_id\s*=\s*v_usuario_id/i);
  assert.match(sql, /BRANCH_NOT_ASSIGNED/);
});

test('exige caja ABIERTA propia y toma bloqueo transaccional', () => {
  assert.match(sql, /c\.usuario_id\s*=\s*v_usuario_id/i);
  assert.match(sql, /c\.estado\s*=\s*'ABIERTA'/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /OPEN_CASH_REGISTER_REQUIRED/);
});

test('función no registra venta ni altera inventario, caja o correlativos', () => {
  assert.match(sql, /saleCreated',\s*false/i);
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+public\.(comprobante|producto_stock|producto_variante_stock|caja_movimiento|serie_correlativo)|DELETE\s+FROM)\b/i);
});

test('función restringe ejecución a authenticated y fija search_path', () => {
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = pg_catalog, public/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION .* FROM PUBLIC/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION .* TO authenticated/i);
});
