import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations-preview/202611090005_purchase_receive_auth.sql', 'utf8');

test('purchase receive RPC is preview-only and guarded by prerequisite schema', () => {
  assert.match(sql, /PREVIEW ONLY/);
  assert.match(sql, /PURCHASE_RECEIPT_SCHEMA_NOT_READY/);
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
});

test('RPC authenticates the user and restricts purchase creation to ADMIN', () => {
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path=''/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /public\.mi_usuario_id\(\)/);
  assert.match(sql, /public\.mi_empresa_id\(\)/);
  assert.match(sql, /public\.mi_rol\(\)/);
  assert.match(sql, /role_name IS DISTINCT FROM 'ADMIN'/);
  assert.match(sql, /public\.mi_puede_ver_sucursal\(branch_id\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_compra_recibir_auth\(jsonb\) FROM PUBLIC,anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_compra_recibir_auth\(jsonb\) TO authenticated/);
});

test('idempotency uses a transaction lock and compares the full JSONB payload hash', () => {
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /md5\(p_payload::text\)/);
  assert.match(sql, /PURCHASE_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /'repetida',true/);
});

test('purchase lines convert packs, enforce catalog IGV and calculate weighted cost', () => {
  assert.match(sql, /round\(packs\*units_per_pack,3\)/);
  assert.match(sql, /round\(pack_cost\/units_per_pack,4\)/);
  assert.match(sql, /PURCHASE_IGV_MISMATCH/);
  assert.match(sql, /round\(amount\/1\.18,2\)/);
  assert.match(sql, /avg_after:=round\(\(\(stock_before\*avg_before\)\+\(qty\*unit_cost\)\)\/\(stock_before\+qty\),4\)/);
  assert.match(sql, /ORDER BY \(value->>'productoId'\)::integer/);
  assert.doesNotMatch(sql, /packs:\(/);
});

test('receipt atomically writes purchase lines, FEFO lots, stock and inventory movement', () => {
  assert.match(sql, /INSERT INTO public\.compra_linea/);
  assert.match(sql, /INSERT INTO public\.inventario_lote/);
  assert.match(sql, /UPDATE public\.producto_stock/);
  assert.match(sql, /UPDATE public\.producto_variante_stock/);
  assert.match(sql, /INSERT INTO public\.movimiento_inventario/);
});

test('payment handling enforces one open cashbox and excludes transfers from cash movements', () => {
  assert.match(sql, /PURCHASE_MULTIPLE_CASHBOXES/);
  assert.match(sql, /PURCHASE_CASHBOX_NOT_OPEN/);
  assert.match(sql, /PURCHASE_CASH_NOT_ENOUGH/);
  assert.match(sql, /PURCHASE_CREDIT_INITIAL_PAYMENT_NOT_ALLOWED/);
  assert.match(sql, /INSERT INTO public\.compra_pago/);
  assert.match(sql, /INSERT INTO public\.caja_movimiento/);
  assert.match(sql, /IF cash_id IS NOT NULL THEN/);
});

test('RPC validates direct-call document/payment fields and locks selected variants', () => {
  assert.match(sql, /length\(doc_series\)>12/);
  assert.match(sql, /length\(doc_number\)>30/);
  assert.match(sql, /length\(COALESCE\(payment->>'referencia',''\)\)>120/);
  assert.match(sql, /length\(COALESCE\(line->>'codigoLote',''\)\)>80/);
  assert.match(sql, /FOR UPDATE;/);
});

test('direct payload rejects missing payment condition and non-array lines', () => {
  assert.match(sql, /pay_condition IS NULL OR pay_condition NOT IN/);
  assert.match(sql, /jsonb_typeof\(p_payload->'lineas'\) IS DISTINCT FROM 'array'/);
  assert.match(sql, /jsonb_array_length\(COALESCE\(p_payload->'lineas','\[\]'::jsonb\)\)/);
});
