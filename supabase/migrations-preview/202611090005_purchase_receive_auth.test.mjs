import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, '202611090005_purchase_receive_auth.sql'), 'utf8');

test('purchase receive RPC is preview-only and guarded by prerequisite schema', () => {
  assert.ok(sql.startsWith('-- PREVIEW ONLY. Depends on migrations 002 and 004. Do not apply to production.'));
  assert.ok(sql.includes('\nBEGIN;'));
  assert.match(sql, /PURCHASE_RECEIPT_SCHEMA_NOT_READY/);
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

test('purchase receipt hash column and variant identifier match historical schema types', () => {
  assert.match(sql, /column_name='payload_hash'/);
  assert.match(sql, /c\.payload_hash/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS payload_hash text/);
  assert.match(sql, /variant_id integer/);
  assert.doesNotMatch(sql, /variant_id bigint|::bigint/);
  assert.doesNotMatch(sql, /NULLIF\(line->>'varianteId',''\)::bigint/);
});

test('purchase lines convert packs, enforce catalog IGV and calculate weighted cost', () => {
  assert.match(sql, /round\(packs\*units_per_pack,3\)/);
  assert.match(sql, /round\(pack_cost\/units_per_pack,4\)/);
  assert.match(sql, /PURCHASE_IGV_MISMATCH/);
  assert.match(sql, /round\(amount\/1\.18,2\)/);
  assert.match(sql, /avg_after:=round\(\(\(stock_before\*COALESCE\(avg_before,0\)\)\+\(qty\*unit_cost\)\)\/\(stock_before\+qty\),4\)/);
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


test('cash availability does not double-deduct refunds already posted to the cash ledger', () => {
  assert.ok(sql.includes('FROM public.devolucion_venta_pago dp'));
  assert.ok(sql.includes("d.estado='REGISTRADA' AND dp.metodo_pago='EFECTIVO'"));
  assert.ok(sql.includes('SELECT cash_available-COALESCE(sum(dp.monto),0)'));
  assert.ok(sql.includes('AND NOT EXISTS ('));
  assert.ok(sql.includes('cm.devolucion_venta_id=d.id'));
  assert.ok(sql.includes("cm.motivo ILIKE 'Reembolso por devolución%'"));
  assert.ok(sql.indexOf('SELECT cash_available-COALESCE(sum(dp.monto),0)') < sql.indexOf('IF cash_out>cash_available'));
});

test('purchase stock receipt preserves variant identity and creates lot trace for the same variant', () => {
  assert.match(sql, /INSERT INTO public\.inventario_lote\(empresa_id,sucursal_id,producto_id,variante_id,compra_id,compra_linea_id/);
  assert.match(sql, /UPDATE public\.producto_variante_stock SET stock=stock_after,costo_promedio=avg_after/);
  assert.match(sql, /VALUES\(company_id,branch_id,product_id,variant_id,purchase_id,purchase_line_id,batch_code,expiry_date,qty,qty,unit_cost\)/);
});

test('allows repeated product/variant lines when each line has a distinct lot identity', () => {
  assert.ok(sql.includes('line_ordinal integer;'));
  assert.ok(sql.includes('FOR line,line_ordinal IN'));
  assert.ok(sql.includes('WITH ORDINALITY AS item(value,ordinality)'));
  assert.ok(sql.includes("THEN 'AUTO:'||line_ordinal::text"));
  assert.ok(sql.includes("ELSE 'LOT:'||upper(btrim(line->>'codigoLote'))"));
  assert.ok(sql.includes('PURCHASE_DUPLICATE_LINE'));
  assert.ok(!sql.includes("line_key:=product_id::text||':'||COALESCE(variant_id::text,'base');"));
});

test('purchase receipt rejects already expired lots before any stock write', () => {
  assert.ok(sql.includes("expiry_date:=NULLIF(line->>'fechaVencimiento','')::date;"));
  assert.ok(sql.includes("IF expiry_date IS NOT NULL AND expiry_date<(now() AT TIME ZONE 'America/Lima')::date THEN"));
  assert.ok(sql.includes('PURCHASE_LOT_ALREADY_EXPIRED'));
  const expiryGuard = sql.indexOf('PURCHASE_LOT_ALREADY_EXPIRED');
  const purchaseInsert = sql.indexOf('INSERT INTO public.compra(');
  assert.ok(expiryGuard >= 0 && expiryGuard < purchaseInsert);
});
