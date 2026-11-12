import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const sql=fs.readFileSync(path.join(here,'202611070045_cash_refund_reconciliation_auth.sql'),'utf8');
const historySql=fs.readFileSync(path.join(here,'202611070044_cash_movements_history_auth.sql'),'utf8');
test('cash summary and history resolve users through the supabase_auth_user_id column',()=>{
 assert.match(sql,/supabase_auth_user_id=v_auth/);
 assert.match(historySql,/supabase_auth_user_id=v_auth/);
 assert.match(sql+historySql,/supabase_auth_user_id=v_auth/);\n assert.doesNotMatch(sql+historySql,/auth_user_id=v_auth/);
});

test('cash summary subtracts refunds by actual refund payment method',()=>{
 assert.match(sql,/devolucion_venta_pago/);
 assert.match(sql,/v_dev_efectivo/);
 assert.match(sql,/v_dev_yape/);
 assert.match(sql,/v_dev_plin/);
 assert.match(sql,/totalDevoluciones/);
 assert.match(sql,/v_efectivo_esperado:=round/);
});
test('refunds appear as cash outflows in persistent movement history',()=>{
 assert.match(sql,/'tipo','SALIDA'/);
 assert.match(sql,/'motivo','Reembolso devolución #'/);
 assert.match(sql,/d\.caja_id=p_caja_id/);
 assert.match(sql,/d\.usuario_id=v_usuario/);
});
test('both RPCs remain authenticated and scoped to owned cash register',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/c\.usuario_id=v_usuario/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pos_caja_resumen_auth\(integer\) TO authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pos_caja_movimientos_listar_auth\(integer\) TO authenticated/);
});

test('cash summary includes manual movements in every tender and subtracts refunds',()=>{
 assert.match(sql,/v_mov_tarjeta/);
 assert.match(sql,/v_mov_yape/);
 assert.match(sql,/v_mov_plin/);
 assert.match(sql,/v_efectivo,0\)-COALESCE\(v_dev_efectivo,0\)\+COALESCE\(v_mov_efectivo,0\)/);
 assert.match(sql,/v_tarjeta,0\)-COALESCE\(v_dev_tarjeta,0\)\+COALESCE\(v_mov_tarjeta,0\)/);
});
test('cash summary reports net sales after registered returns',()=>{
 assert.match(sql,/GREATEST\(0,c\.total-COALESCE\(d\.total_devuelto,0\)\)/);
 assert.match(sql,/totalDevoluciones/);
});


test('refunds are not double-counted as both caja_movimiento and devolucion_venta_pago',()=>{
 assert.match(sql,/devolucion_venta_id IS NULL/);
 assert.match(sql,/FROM public\.devolucion_venta_pago dp/);
 assert.match(sql,/WHERE d\.caja_id=p_caja_id AND d\.usuario_id=v_usuario AND d\.estado='REGISTRADA'/);
});
