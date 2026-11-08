import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070028_sales_payment_validation.sql', import.meta.url), 'utf8');
const writer = readFileSync(new URL('./202611070033_sales_document_payment_writer_internal.sql', import.meta.url), 'utf8');

test('el total de pagos debe coincidir exactamente a dos decimales', () => {
  assert.match(sql, /IF v_suma <> v_total THEN/);
  assert.doesNotMatch(sql, /abs\(v_suma - v_total\) > 0\.01/);
  assert.match(sql, /SALE_PAYMENT_SUM_MISMATCH/);
});

test('Yape, Plin y tarjeta cuentan como ingreso cobrado, no como crédito', () => {
  assert.match(sql, /'EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO'/);
  assert.match(sql, /v_ingreso_caja := round\(v_ingreso_caja \+ v_monto, 2\)/);
  assert.match(sql, /v_credito := round\(v_credito \+ v_monto, 2\)/);
});

test('el vuelto se calcula solo sobre efectivo recibido y no aumenta el ingreso de caja', () => {
  assert.match(sql, /v_vuelto := round\(v_recibido - v_monto, 2\)/);
  assert.match(sql, /'vuelto', v_vuelto_total/);
  assert.match(writer, /cashIncomeSource', 'COMPROBANTE_PAGO'/);
  assert.match(writer, /cashMovementsCreated', 0/);
});

test('el crédito genera cuenta por cobrar por su componente exacto', () => {
  assert.match(writer, /total_credito, saldo_pendiente/);
  assert.match(writer, /v_monto_credito, v_monto_credito/);
  assert.match(writer, /SET saldo_credito = COALESCE\(saldo_credito, 0\) \+ v_monto_credito/);
});

test('la validación de pagos permanece como helper interno no ejecutable por clientes', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_validar_pagos_interno\(jsonb, numeric, jsonb\) FROM anon/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_validar_pagos_interno\(jsonb, numeric, jsonb\) FROM authenticated/i);
});
