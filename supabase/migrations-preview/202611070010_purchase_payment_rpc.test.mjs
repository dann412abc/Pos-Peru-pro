import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('./202611070010_purchase_payment_rpc.sql', import.meta.url), 'utf8');
test('RPC de pagos exige identidad autenticada y deriva empresa desde auth.uid()', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /supabase_auth_user_id=v_auth/);
  assert.doesNotMatch(sql, /p_empresa_id|p_usuario_id/);
});
test('RPC de pagos bloquea compra y valida saldo antes de aplicar el pago', () => {
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /v_monto>v_compra\.saldo_pendiente/);
  assert.match(sql, /UPDATE public\.compra SET pagado=v_pagado,saldo_pendiente/);
});
test('RPC de pagos registra idempotencia y movimiento de caja en la misma transacción', () => {
  assert.match(sql, /idempotency_key=v_idem/);
  assert.match(sql, /INSERT INTO public\.caja_movimiento/);
  assert.match(sql, /INSERT INTO public\.compra_pago/);
  assert.match(sql, /COMMIT;/);
});
