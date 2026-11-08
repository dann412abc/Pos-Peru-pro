import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations-preview/202611070027_sales_server_calculation.sql','utf8');

test('la calculadora es pura e inmutable y no escribe tablas operativas', () => {
  assert.match(sql, /LANGUAGE plpgsql\s+IMMUTABLE/i);
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
});

test('valida líneas, cantidades, precios, descuentos y tipos IGV', () => {
  for (const token of [
    'SALE_LINES_MUST_BE_ARRAY', 'SALE_LINES_COUNT_INVALID',
    'SALE_LINE_NUMERIC_VALUE_INVALID', 'SALE_LINE_VALUE_INVALID',
    'LINE_DISCOUNT_EXCEEDS_GROSS', 'GLOBAL_DISCOUNT_EXCEEDS_SALE'
  ]) assert.ok(sql.includes(token), `Falta validación ${token}`);
  assert.match(sql, /v_tax_type IS NULL OR v_tax_type NOT IN \(10, 20, 30\)/);
});

test('calcula IGV incluido a 18% y separa gravadas, exoneradas e inafectas', () => {
  assert.match(sql, /round\(v_after_global \/ 1\.18, 2\)/);
  assert.match(sql, /round\(v_base \* 0\.18, 2\)/);
  assert.match(sql, /v_op_gravadas/);
  assert.match(sql, /v_op_exoneradas/);
  assert.match(sql, /v_op_inafectas/);
});

test('distribuye descuento global y conserva el residuo de centavos', () => {
  assert.match(sql, /v_discount_global \* v_net \/ v_total_before_global/);
  assert.match(sql, /v_row\.ord = v_count/);
  assert.match(sql, /GLOBAL_DISCOUNT_REMAINDER_NOT_ZERO/);
  assert.match(sql, /descuentoGlobalAsignado/);
});

test('no concede ejecución directa a usuarios ni anon', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_calcular_importes_interno\(jsonb, numeric\) FROM authenticated/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_calcular_importes_interno\(jsonb, numeric\) FROM anon/i);
});
