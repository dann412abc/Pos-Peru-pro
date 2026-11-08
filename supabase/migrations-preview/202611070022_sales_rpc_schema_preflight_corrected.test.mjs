import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sql = readFileSync(join(root, 'supabase/migrations-preview/202611070022_sales_rpc_schema_preflight_corrected.sql'), 'utf8');
const migrationsDir = join(root, 'backend/src/database/migrations');
const migrationText = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
  .join('\n');

const required = [...sql.matchAll(/\('([a-z_]+)'\s*,\s*'([a-z_]+)'\)/g)]
  .map((match) => `${match[1]}.${match[2]}`);

test('preflight no exige columnas inventadas o incompatibles', () => {
  for (const invalid of [
    'producto.tiene_variantes',
    'producto_stock.costo_promedio_legacy',
    'producto_variante_stock.nombre',
    'comprobante_pago.empresa_id',
    'caja_movimiento.empresa_id',
  ]) assert.equal(required.includes(invalid), false, `${invalid} no debe ser requisito`);
});

test('cada columna requerida tiene respaldo textual en las migraciones', () => {
  assert.ok(required.length >= 100, `se esperaban al menos 100 requisitos, hay ${required.length}`);
  const unsupported = required.filter((entry) => {
    const [, column] = entry.split('.');
    return !new RegExp(`\\b${column}\\b`).test(migrationText);
  });
  assert.deepEqual(unsupported, [], `columnas sin respaldo en migraciones: ${unsupported.join(', ')}`);
});

test('diagnóstico es de solo lectura y no crea ni altera esquema', () => {
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /to_regclass/);
  assert.doesNotMatch(sql, /\b(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\s+(TABLE|INDEX|FUNCTION|TRIGGER|POLICY|COLUMN|INTO|SET)\b/i);
});
