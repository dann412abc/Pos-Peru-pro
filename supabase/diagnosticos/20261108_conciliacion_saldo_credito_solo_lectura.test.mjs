import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./20261108_conciliacion_saldo_credito_solo_lectura.sql', import.meta.url), 'utf8');

test('compara saldo del cliente con saldos pendientes por empresa y cliente', () => {
  assert.match(sql, /c\.empresa_id\s*=\s*cl\.empresa_id/i);
  assert.match(sql, /c\.cliente_id\s*=\s*cl\.id/i);
  assert.match(sql, /cl\.saldo_credito/i);
  assert.match(sql, /SUM\(GREATEST\(COALESCE\(cc\.saldo_pendiente/i);
});

test('identifica diferencias con tolerancia de un céntimo', () => {
  assert.match(sql, /ABS\(diferencia\)\s*<=\s*0\.01/i);
  assert.match(sql, /SALDO_CLIENTE_MAYOR/);
  assert.match(sql, /CUENTAS_POR_COBRAR_MAYORES/);
});

test('no modifica datos ni intenta omitir RLS', () => {
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|SECURITY\s+DEFINER)\b/i);
  assert.match(sql, /respeta RLS/i);
  assert.match(sql, /No usar service_role/i);
});
