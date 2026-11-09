import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations-preview/202611090004_purchase_receipt_fields.sql','utf8');

test('purchase receipt fields are guarded and transaction-wrapped',()=>{
  assert.match(sql,/PURCHASE_RECEIPT_PREREQUISITES_MISSING/);
  assert.match(sql,/PURCHASE_IDEMPOTENCY_INDEX_MISSING/);
  assert.match(sql,/^BEGIN;/);
  assert.match(sql,/COMMIT;\\s*$/);
});

test('credit due date is persisted and constrained against document date',()=>{
  assert.match(sql,/ADD COLUMN IF NOT EXISTS fecha_vencimiento date/);
  assert.match(sql,/condicion_pago='CONTADO' AND fecha_vencimiento IS NULL/);
  assert.match(sql,/fecha_vencimiento >= fecha_documento/);
});

test('idempotency payload hash has a strict normalized format',()=>{
  assert.match(sql,/ADD COLUMN IF NOT EXISTS payload_hash varchar\\(32\\)/);
  assert.match(sql,/payload_hash ~ '\\^\\[0-9a-f\\]\\{32\\}\\$'/);
  assert.match(sql,/uq_compra_empresa_idempotency/);
});
