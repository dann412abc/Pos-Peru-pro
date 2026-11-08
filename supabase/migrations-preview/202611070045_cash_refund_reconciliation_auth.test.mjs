import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const sql=fs.readFileSync(path.join(here,'202611070045_cash_refund_reconciliation_auth.sql'),'utf8');
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
