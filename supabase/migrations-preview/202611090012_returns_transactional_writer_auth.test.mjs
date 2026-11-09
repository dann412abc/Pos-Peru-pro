import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations-preview/202611090012_returns_transactional_writer_auth.sql','utf8');
const fefo=fs.readFileSync('supabase/migrations-preview/202611090003_returns_register_fefo_auth.sql','utf8');
const cash=fs.readFileSync('supabase/migrations-preview/202611070045_cash_refund_reconciliation_auth.sql','utf8');

test('transactional return writer is the exact dependency invoked by the FEFO wrapper',()=>{
 assert.match(sql,/FUNCTION public\.pos_registrar_devolucion\(\s*p_comprobante_id integer,\s*p_motivo text,\s*p_lineas jsonb,\s*p_pagos jsonb,\s*p_idempotency_key text/s);
 assert.match(fefo,/public\.pos_registrar_devolucion\(/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pos_registrar_devolucion\(integer,text,jsonb,jsonb,text\) TO authenticated/);
});
test('return commit is idempotent and all stock, receivable and cash effects share one transaction',()=>{
 for(const marker of ['pg_advisory_xact_lock','request_hash','devolucion_venta_linea','producto_stock','producto_variante_stock','cuenta_cobrar','devolucion_venta_pago','caja_movimiento'])
  assert.ok(sql.includes(marker),marker);
 assert.match(sql,/BEGIN;/); assert.match(sql,/COMMIT;\s*$/);
 assert.match(sql,/RETURN jsonb_build_object\('id',v_existente\.id/);
});
test('cash ledger links refunds and cash summary subtracts refunds by method',()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS devolucion_venta_id bigint/);
 assert.match(sql,/FOREIGN KEY \(devolucion_venta_id,caja_id\)/);
 assert.match(sql,/'SALIDA'/);
 assert.match(cash,/devolucion_venta_pago/);
});
test('FEFO wrapper restores original sale lots after transactional stock and cash commit',()=>{
 assert.match(fefo,/comprobante_lote_salida/);
 assert.match(fefo,/comprobante_linea_id=v_linea_id/);
 assert.match(fefo,/devolucion_venta_lote/);
});

test('partial return value calculation only aggregates already-registered returns',()=>{
 assert.match(sql,/sum\(dl\.monto\) FILTER \(WHERE d\.id IS NOT NULL\)/);
 assert.match(sql,/sum\(dl\.cantidad\) FILTER \(WHERE d\.id IS NOT NULL\)/);
});

test('fully reversed receivable also synchronizes the original receipt state',()=>{
 assert.match(sql,/UPDATE public\.comprobante SET estado='PAGADA'/);
 assert.match(sql,/v_cuenta\.saldo_pendiente-v_credito<=0/);
});

test('returns writer fails fast when identity helpers or required schema columns are missing',()=>{
 assert.match(sql,/RETURNS_AUTH_PREREQUISITES_MISSING/);
 assert.match(sql,/RETURNS_SCHEMA_MISMATCH/);
 for(const marker of ['mi_usuario_id','mi_empresa_id','mi_rol','mi_puede_ver_sucursal',
   'producto_stock','producto_variante_stock','updated_at','monto_revertido','devolucion_venta_linea'])
  assert.ok(sql.includes(marker),marker);
});
