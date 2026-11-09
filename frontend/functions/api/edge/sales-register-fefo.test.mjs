import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('frontend/functions/api/edge/[[path]].js','utf8');
const sale=fs.readFileSync('supabase/migrations-preview/202611090006_sales_fefo_auth.sql','utf8');
const returns=fs.readFileSync('supabase/migrations-preview/202611090003_returns_register_fefo_auth.sql','utf8');

test('sales register Edge route forwards authenticated payload to FEFO wrapper',()=>{
  assert.match(edge,/route === 'sales\/register'/);
  assert.match(edge,/pos_registrar_venta_fefo_auth/);
  assert.match(edge,/SALE_FEFO_MIGRATION_REQUIRED/);
  assert.match(edge,/authorization: `Bearer \\${token\\}`/);
});

test('sale lot trace has an exact foreign key to comprobante_linea',()=>{
  assert.match(sale,/comprobante_linea_id integer/);
  assert.match(sale,/REFERENCES public\.comprobante_linea\(id\)/);
  assert.match(sale,/comprobante_linea_id,lote_id,producto_id/);
});

test('returns use the same exact line-to-lot relationship',()=>{
  assert.match(returns,/cls\.comprobante_linea_id=v_linea_id/);
  assert.doesNotMatch(returns,/TRAZABILIDAD_AMBIGUA/);
});
