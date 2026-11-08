import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations-preview/202611070028_sales_payment_validation.sql','utf8');

test('el validador es puro e inmutable y no escribe tablas operativas', () => {
  assert.match(sql, /LANGUAGE plpgsql\s+IMMUTABLE/i);
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
});

test('valida lista de pagos, cantidad, total y medios permitidos', () => {
  for (const token of [
    'SALE_PAYMENTS_MUST_BE_ARRAY', 'SALE_PAYMENTS_COUNT_INVALID',
    'SALE_PAYMENT_TOTAL_INVALID', 'SALE_PAYMENT_METHOD_INVALID',
    'SALE_PAYMENT_METHOD_DUPLICATED', 'SALE_PAYMENT_SUM_MISMATCH'
  ]) assert.ok(sql.includes(token), `Falta validación ${token}`);
  assert.match(sql, /'EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO'/);
});

test('solo efectivo acepta monto recibido y calcula vuelto', () => {
  assert.match(sql, /SALE_CASH_RECEIVED_BELOW_AMOUNT/);
  assert.match(sql, /SALE_RECEIVED_AMOUNT_ONLY_FOR_CASH/);
  assert.match(sql, /round\(v_recibido - v_monto, 2\)/);
});

test('crédito exige perfil autorizado y respeta disponible', () => {
  assert.match(sql, /SALE_CREDIT_NOT_AUTHORIZED/);
  assert.match(sql, /SALE_CREDIT_LIMIT_EXCEEDED/);
  assert.match(sql, /v_limite - v_saldo/);
  assert.match(sql, /COALESCE\(v_numero_cliente, ''\) = '00000000'/);
});

test('separa ingresos de caja y crédito, y devuelve resumen normalizado', () => {
  assert.match(sql, /'ingresaCaja', CASE WHEN v_metodo = 'CREDITO' THEN 0 ELSE v_monto END/);
  assert.match(sql, /'ingresoCaja', v_ingreso_caja/);
  assert.match(sql, /'totalCredito', v_credito/);
  assert.match(sql, /'saldoPorCobrar', v_credito/);
  assert.match(sql, /'estadoComprobante', CASE WHEN v_credito > 0 THEN 'PENDIENTE' ELSE 'PAGADA' END/);
});

test('el helper no concede ejecución directa a anon ni authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_validar_pagos_interno\(jsonb, numeric, jsonb\) FROM authenticated/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_validar_pagos_interno\(jsonb, numeric, jsonb\) FROM anon/i);
});
