import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations-preview/202611090002_inventory_lots_returns_compat.sql','utf8');

test('FEFO preview is additive and guarded by singular-model prerequisites',()=>{
  assert.match(sql,/INVENTORY_LOTS_PREREQUISITES_MISSING/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS variante_id bigint/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.inventario_lote/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.comprobante_lote_salida/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.devolucion_venta_lote/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS producto_id integer/);
});

test('variant stock product link is backfilled and checked before use',()=>{
  assert.match(sql,/SET producto_id=pv\.producto_id/);
  assert.match(sql,/INVENTORY_VARIANT_STOCK_PRODUCT_LINK_MISSING/);
  assert.match(sql,/fk_variante_stock_producto/);
});

test('opening lots preserve existing base and variant balances without changing stock totals',()=>{
  assert.match(sql,/FROM public\.producto_stock ps/);
  assert.match(sql,/FROM public\.producto_variante_stock vs/);
  assert.match(sql,/APERTURA-VAR-/);
  assert.match(sql,/NOT EXISTS \(/);
  assert.doesNotMatch(sql,/UPDATE public\.producto_stock\s+SET stock/i);
  assert.doesNotMatch(sql,/UPDATE public\.producto_variante_stock\s+SET stock/i);
});

test('lot tables are not directly writable by client roles',()=>{
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.inventario_lote,public\.comprobante_lote_salida,public\.devolucion_venta_lote FROM PUBLIC,anon,authenticated/);
});

test('migration is transaction-wrapped and does not seed sales or returns',()=>{
  assert.match(sql,/^BEGIN;/);
  assert.match(sql,/COMMIT;\s*$/);
  assert.doesNotMatch(sql,/INSERT INTO public\.(comprobante_lote_salida|devolucion_venta_lote)/i);
});

test('purchase lines support distinct variants but prevent duplicate product/variant pairs',()=>{
  assert.match(sql,/DROP CONSTRAINT IF EXISTS uq_compra_linea_producto/);
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS uq_compra_linea_producto_variante/);
  assert.match(sql,/COALESCE\(variante_id,0\)/);
});
