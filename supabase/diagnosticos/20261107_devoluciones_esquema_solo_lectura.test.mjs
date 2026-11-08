import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const sql=fs.readFileSync(path.join(process.cwd(),'supabase/diagnosticos/20261107_devoluciones_esquema_solo_lectura.sql'),'utf8');
test('diagnostic covers return, cash, inventory and receivable schema',()=>{
 for(const name of ['devolucion_venta','devolucion_venta_linea','devolucion_venta_pago','devolucion_venta_lote','caja_movimiento','producto_stock','producto_variante_stock','inventario_lote','comprobante_lote_salida','movimiento_inventario','cuenta_cobrar'])
  assert.match(sql,new RegExp(`\\('${name}'\\)`));
});
test('diagnostic returns column types, constraints, indexes and RLS policies',()=>{
 for(const key of ['information_schema.columns','pg_constraint','pg_get_constraintdef','pg_index','pg_get_indexdef','pg_policies','numeric_precision','numeric_scale'])
  assert.ok(sql.includes(key),`missing ${key}`);
});
test('diagnostic is read-only',()=>{
 assert.match(sql,/solo lectura/i);
 assert.doesNotMatch(sql,/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|DROP)\s+(TABLE|FUNCTION|POLICY|INDEX|INTO|SET|FROM|SCHEMA)\b/i);
});
