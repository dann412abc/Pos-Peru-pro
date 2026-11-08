import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '20261108_auditoria_estructura_caja_cobros_devoluciones_solo_lectura.sql'), 'utf8');
test('incluye las tablas de caja, cobros y devoluciones', () => {
  for (const name of ['caja_movimiento','cobro_cliente','cuenta_cobrar','devolucion_venta_pago','comprobante_pago']) assert.match(sql, new RegExp(`'${name}'`));
});
test('inspecciona RLS, claves, índices y triggers', () => {
  for (const token of ['pg_constraint','pg_index','pg_policies','information_schema.triggers']) assert.ok(sql.includes(token));
});
test('no contiene instrucciones que modifiquen esquema o datos', () => {
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(TABLE|FUNCTION|TRIGGER|POLICY)|ALTER\s+TABLE|DROP\s+TABLE|GRANT\s|REVOKE\s)\b/i);
});

test('lee search_path de funciones con sintaxis válida de string_agg', () => {
  assert.match(sql, /string_agg\(config\.setting,\s*','\)/);
  assert.match(sql, /unnest\(coalesce\(p\.proconfig,ARRAY\[\]::text\[\]\)\) AS config\(setting\)/);
});
