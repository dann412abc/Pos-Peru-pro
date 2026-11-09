import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations-preview/202611090007_inventory_adjustments_lots_auth.sql','utf8');

test('preview migration requires the lot schema and is transaction-wrapped',()=>{
  assert.match(sql,/PREVIEW ONLY/);
  assert.match(sql,/INVENTORY_ADJUSTMENT_PREREQUISITES_MISSING/);
  assert.match(sql,/^BEGIN;/);
  assert.match(sql,/COMMIT;\s*$/);
});

test('adjustment requires authenticated ADMIN and an authorized branch',()=>{
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/public\.mi_usuario_id\(\)/);
  assert.match(sql,/public\.mi_empresa_id\(\)/);
  assert.match(sql,/mi_rol\(\) IS DISTINCT FROM 'ADMIN'/);
  assert.match(sql,/mi_puede_ver_sucursal\(v_sucursal_id\)/);
});

test('adjustments are idempotent and reject key reuse with different payloads',()=>{
  assert.match(sql,/inventario_ajuste_idempotencia/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/INVENTORY_IDEMPOTENCY_CONFLICT/);
  assert.match(sql,/INVENTORY_IDEMPOTENCY_INCOMPLETE/);
});

test('both product and variant stock are updated with corresponding lot movements',()=>{
  assert.match(sql,/producto_stock/);
  assert.match(sql,/producto_variante_stock/);
  assert.match(sql,/variante_id IS NOT DISTINCT FROM v_variante_id/);
  assert.match(sql,/ORDER BY il\.fecha_vencimiento ASC NULLS LAST,il\.created_at ASC,il\.id ASC/);
  assert.match(sql,/INSERT INTO public\.inventario_lote/);
  assert.match(sql,/INSERT INTO public\.movimiento_inventario/);
});

test('outbound adjustment refuses stock-lot mismatch and rolls back atomically',()=>{
  assert.match(sql,/INVENTORY_LOT_BALANCE_MISMATCH/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/cantidad_disponible=cantidad_disponible-v_tomar/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pos_inventario_ajustar_lote_auth\(jsonb\) TO authenticated/);
});
