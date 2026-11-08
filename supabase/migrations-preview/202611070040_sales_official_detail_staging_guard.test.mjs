import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const integration = fs.readFileSync(path.join(root, 'supabase/tests/sales-transaction-staging.integration.test.mjs'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations-preview/202611070039_sales_comprobante_detail_auth.sql'), 'utf8');

test('staging verifica recuperación oficial autenticada del comprobante', () => {
  assert.match(integration, /pos_comprobante_detalle_auth\(\$1::integer\)/);
  assert.match(integration, /official\.lineas/);
  assert.match(integration, /official\.pagos/);
  assert.match(integration, /officialPaid - Number\(official\.total\)/);
});

test('RPC de detalle permanece de solo lectura y restringida a authenticated', () => {
  assert.match(migration, /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM anon/);
  assert.doesNotMatch(migration, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
});
