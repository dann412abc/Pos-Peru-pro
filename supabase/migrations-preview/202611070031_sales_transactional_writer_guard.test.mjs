import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070031_sales_transactional_writer_guard.sql', import.meta.url), 'utf8');

test('la barrera delega en la prevalidación autenticada integrada', () => {
  assert.match(sql, /public\.pos_venta_preparar_auth\(p_payload\)/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = pg_catalog, public, auth/i);
});

test('la barrera siempre devuelve WRITER_DISABLED y no éxito de venta', () => {
  assert.match(sql, /'decision',\s*'WRITER_DISABLED'/i);
  assert.match(sql, /'ok',\s*false/i);
  assert.match(sql, /SALE_TRANSACTIONAL_WRITER_NOT_READY/i);
});

test('la barrera declara que no crea ni modifica datos operativos', () => {
  for (const field of ['saleCreated', 'paymentsCreated', 'inventoryChanged', 'cashMovementCreated', 'receivableCreated', 'correlativoConsumed']) {
    assert.match(sql, new RegExp(`'${field}',\\s*false`, 'i'));
  }
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
});

test('solo authenticated puede ejecutar la barrera', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_transaccion_guardia_auth\(jsonb\) FROM PUBLIC/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_transaccion_guardia_auth\(jsonb\) FROM anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_venta_transaccion_guardia_auth\(jsonb\) TO authenticated/i);
});

test('la función fija search_path y no confía en identidad del payload', () => {
  assert.match(sql, /SET search_path = pg_catalog, public, auth/i);
  assert.doesNotMatch(sql, /auth\.uid\(\)\s*:=|usuarioId.*empresaId.*rol/i);
});

test('la función no contiene ninguna escritura ni reserva de correlativo', () => {
  assert.doesNotMatch(sql, /nextval\s*\(|UPDATE\s+serie_correlativo|INSERT\s+INTO\s+comprobante/i);
});
