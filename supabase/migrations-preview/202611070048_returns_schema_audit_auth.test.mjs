import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const sql=fs.readFileSync(path.join(process.cwd(),'supabase/migrations-preview/202611070048_returns_schema_audit_auth.sql'),'utf8');
const api=fs.readFileSync(path.join(process.cwd(),'frontend/src/api/supabaseReturns.ts'),'utf8');
test('schema audit is authenticated and read-only',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pos_devolucion_esquema_verificar_auth\(\) TO authenticated/);
 assert.match(sql,/FROM PUBLIC,anon/);
 assert.doesNotMatch(sql,/INSERT INTO public\.|UPDATE public\.|DELETE FROM public\./i);
});
test('schema audit checks core sales, return, cash, inventory and receivable tables',()=>{
 for(const table of ['comprobante','comprobante_linea','devolucion_venta','devolucion_venta_linea','devolucion_venta_pago','caja_movimiento','producto_stock','producto_variante_stock','inventario_lote','comprobante_lote_salida','movimiento_inventario','cuenta_cobrar','cliente'])
  assert.match(sql,new RegExp(`'tabla','${table}'`));
 assert.match(sql,/information_schema\.columns/);
});
test('schema audit never reports write readiness',()=>{
 assert.match(sql,/'puedeHabilitarRegistro',false/);
 assert.match(api,/verifySupabaseReturnsSchema/);
 assert.match(api,/data\.puedeHabilitarRegistro !== false/);
});
