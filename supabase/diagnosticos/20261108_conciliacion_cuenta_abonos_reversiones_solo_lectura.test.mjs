import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./20261108_conciliacion_cuenta_abonos_reversiones_solo_lectura.sql', import.meta.url), 'utf8');

test('concilia abonos por empresa y cuenta', () => {
  assert.match(sql, /ab\.empresa_id\s*=\s*cuenta\.empresa_id/i);
  assert.match(sql, /ab\.cuenta_cobrar_id\s*=\s*cuenta\.id/i);
  assert.match(sql, /SUM\(cc\.monto\)/i);
  assert.match(sql, /total_abonado/i);
});

test('separa medios de pago y compara reversión sin asumir causalidad', () => {
  for (const method of ['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA', 'TRANSFERENCIA']) assert.match(sql, new RegExp(method));
  assert.match(sql, /diferencia_sin_ajuste_devolucion/i);
  assert.match(sql, /monto_revertido/i);
  assert.match(sql, /REQUIERE_REVISION_DOCUMENTAL/);
});

test('es estrictamente de solo lectura y advierte sobre RLS', () => {
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|SECURITY\s+DEFINER)\b/i);
  assert.match(sql, /JWT de usuario authenticated/i);
  assert.match(sql, /No usar service_role/i);
  assert.match(sql, /no actualiza saldos/i);
});
