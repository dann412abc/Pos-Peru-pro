import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const edge=readFileSync(new URL('./[[path]].js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../../../supabase/migrations-preview/202611070043_cash_register_lifecycle_auth.sql',import.meta.url),'utf8');
test('Edge expone apertura, movimiento y cierre con Bearer y validación de payload',()=>{
 for(const route of ['cash/open','cash/movement','cash/close']) assert.ok(edge.includes(route));
 assert.match(edge,/if \(!token\) return json\(\{ error: 'UNAUTHORIZED'/);
 assert.match(edge,/INVALID_CASH_OPEN/); assert.match(edge,/INVALID_CASH_MOVEMENT/); assert.match(edge,/INVALID_CASH_CLOSE/);
});
test('apertura deriva usuario autenticado y valida sucursal autorizada',()=>{
 assert.match(sql,/pos_caja_abrir_auth/); assert.match(sql,/auth\.uid\(\)/); assert.match(sql,/usuario_sucursal/);
 assert.match(sql,/uq_caja_abierta|unique_violation/i);
});
test('movimientos bloquean la caja y verifican fondos antes de egreso en efectivo',()=>{
 assert.match(sql,/FOR UPDATE OF c/); assert.match(sql,/CASH_INSUFFICIENT_FUNDS/); assert.match(sql,/pos_caja_movimiento_auth/);
});
test('cierre bloquea la caja, calcula arqueo y actualiza estado en una transacción',()=>{
 assert.match(sql,/pos_caja_cerrar_auth/); assert.match(sql,/FOR UPDATE OF c/);
 assert.match(sql,/UPDATE public\.caja SET estado='CERRADA'/); assert.match(sql,/diferencia/);
});
test('todas las RPC de escritura revocan PUBLIC y anon',()=>{
 for(const fn of ['pos_caja_abrir_auth','pos_caja_movimiento_auth','pos_caja_cerrar_auth']) {
  assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${fn}`));
  assert.ok(sql.includes(`TO authenticated`));
 }
});
