import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070043_cash_register_lifecycle_auth.sql', import.meta.url), 'utf8');
const closeFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pos_caja_cerrar_auth'));
const movementFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pos_caja_movimiento_auth'), sql.indexOf('CREATE OR REPLACE FUNCTION public.pos_caja_cerrar_auth'));

test('cash close subtracts registered refunds by their actual payment method', () => {
  assert.match(closeFn, /FROM public\.devolucion_venta_pago dp[\s\S]*JOIN public\.devolucion_venta d[\s\S]*d\.estado='REGISTRADA'/);
  assert.match(closeFn, /v_efectivo\+v_mov_efectivo-COALESCE\(v_dev_efectivo,0\)/);
  assert.match(closeFn, /v_tarjeta\+v_mov_tarjeta-COALESCE\(v_dev_tarjeta,0\)/);
  assert.match(closeFn, /v_yape\+v_mov_yape-COALESCE\(v_dev_yape,0\)/);
  assert.match(closeFn, /v_plin\+v_mov_plin-COALESCE\(v_dev_plin,0\)/);
});

test('cash withdrawals cannot spend cash already refunded to customers', () => {
  assert.match(movementFn, /FROM public\.devolucion_venta_pago dp[\s\S]*dp\.metodo_pago='EFECTIVO'[\s\S]*\),0\),2\) INTO v_disponible/);
});

test('cash close still records the counted cash and per-method reconciliation', () => {
  assert.match(closeFn, /'montoEsperado'.*'montoContado'.*'diferencia'/);
  assert.match(closeFn, /estado='CERRADA'.*efectivo_contado=p_efectivo_contado/);
});

test('cash withdrawal availability includes legacy receipts and tenant-scoped movements', () => {
  assert.match(movementFn, /UNION ALL[\\s\\S]*SELECT co\\.metodo_pago,co\\.total[\\s\\S]*NOT EXISTS/);
  assert.match(movementFn, /co\\.empresa_id=v_empresa/);
  assert.match(movementFn, /cm\\.usuario_id=v_usuario/);
  assert.match(movementFn, /d\\.empresa_id=v_empresa/);
});


test('refund-linked cash movements are not counted twice during cash close or withdrawals',()=>{
 assert.match(sql,/cm\.devolucion_venta_id IS NULL/);
 assert.match(sql,/WHERE caja_id=p_caja_id AND devolucion_venta_id IS NULL/);
});
