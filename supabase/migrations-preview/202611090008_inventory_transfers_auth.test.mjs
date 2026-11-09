import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, '202611090008_inventory_transfers_auth.sql'), 'utf8');

test('transfer RPC is preview-only and guarded by required schema', () => {
  assert.match(sql, /PREVIEW ONLY/i);
  assert.match(sql, /INVENTORY_TRANSFER_PREREQUISITES_MISSING/);
  assert.match(sql, /INVENTORY_TRANSFER_MOVEMENT_COLUMNS_MISSING/);
});

test('transfer RPC authenticates the POS identity and both branches', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /public\.mi_usuario_id\(\)/);
  assert.match(sql, /public\.mi_empresa_id\(\)/);
  assert.match(sql, /mi_puede_ver_sucursal\(v_origen\)/);
  assert.match(sql, /mi_puede_ver_sucursal\(v_destino\)/);
});

test('transfer RPC validates unique lines, quantities and idempotent retries', () => {
  assert.match(sql, /INVENTORY_TRANSFER_DUPLICATE_LINE/);
  assert.match(sql, /INVENTORY_TRANSFER_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /uq_inventario_transferencia_idempotencia/);
});

test('transfer RPC moves FEFO lot balances and keeps variant identity', () => {
  assert.match(sql, /ORDER BY fecha_vencimiento ASC NULLS LAST,created_at ASC,id ASC FOR UPDATE/);
  assert.match(sql, /variante_id IS NOT DISTINCT FROM v_variante/);
  assert.match(sql, /producto_variante_stock/);
  assert.match(sql, /INVENTORY_TRANSFER_LOT_BALANCE_MISMATCH/);
});

test('transfer RPC writes paired movements atomically and grants only authenticated execution', () => {
  assert.equal((sql.match(/INSERT INTO public\.movimiento_inventario/g) || []).length, 2);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_inventario_transferir_auth\(jsonb\) FROM PUBLIC,anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_inventario_transferir_auth\(jsonb\) TO authenticated/);
});
