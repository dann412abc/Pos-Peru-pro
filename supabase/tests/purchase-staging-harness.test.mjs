import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('./purchase-receipt-staging.integration.test.mjs', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../docs/COMPRAS-SUPABASE-PRUEBAS-STAGING-v1.44.79.md', import.meta.url), 'utf8');

test('purchase harness requires explicit opt-in, fixture and isolated pg dependency loading', () => {
  assert.match(runner, /POS_PURCHASE_STAGING_CONFIRM === 'YES'/);
  assert.match(runner, /Boolean\(fixturePath\)/);
  assert.match(runner, /if \(enabled\)[\s\S]*require\('pg'\)/);
  assert.match(runner, /POS_PURCHASE_FIXTURE/);
});

test('purchase RPC is always invoked with authenticated JWT claims', () => {
  assert.match(runner, /request\.jwt\.claim\.sub/);
  assert.match(runner, /SET LOCAL ROLE authenticated/);
  assert.match(runner, /pos_compra_recibir_auth/);
});

test('successful receipt verifies purchase, payments, lines, lots, stock and weighted cost', () => {
  for (const token of [
    'public.compra_pago', 'public.compra_linea', 'public.inventario_lote',
    'public.movimiento_inventario', 'public.caja_movimiento',
    'costo_promedio', 'scenario.expected.averageCost'
  ]) assert.ok(runner.includes(token), \`missing assertion token: \${token}\`);
});

test('idempotent replay verifies no duplicate financial or inventory effects', () => {
  assert.match(runner, /replay\.repetida, true/);
  assert.match(runner, /idempotent replay must not duplicate stock, lots, payments or ledgers/);
  assert.match(runner, /assertEffectCounts/);
});

test('expected failure uses savepoint and proves atomic rollback', () => {
  assert.match(runner, /SAVEPOINT before_expected_failure/);
  assert.match(runner, /ROLLBACK TO SAVEPOINT before_expected_failure/);
  assert.match(runner, /PURCHASE_CASH_NOT_ENOUGH/);
  assert.match(runner, /failed receipt must leave captured state unchanged/);
});

test('committed concurrency test is opt-in and documents persistent staging effects', () => {
  assert.match(runner, /POS_PURCHASE_ALLOW_COMMIT_TESTS === 'YES'/);
  assert.match(runner, /await first\.query\('COMMIT'\)/);
  assert.match(guide, /queda persistida/);
  assert.match(guide, /No ejecutar contra producción/);
});

test('fixture guide includes base product, variant, mixed payment, lot and rollback cases', () => {
  for (const token of ['authUserId', 'variantId', 'EFECTIVO', 'YAPE', 'TRANSFERENCIA',
    'codigoLote', 'rollbackCase', 'concurrencyCase', 'PGPASSWORD']) {
    assert.ok(guide.includes(token), \`guide missing \${token}\`);
  }
});
