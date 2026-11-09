import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('./returns-transaction-staging.integration.test.mjs', import.meta.url), 'utf8');

test('returns staging harness requires explicit confirmation and an external fixture', () => {
  assert.match(runner, /POS_RETURNS_STAGING_CONFIRM === 'YES'/);
  assert.match(runner, /Boolean\(fixturePath\)/);
  assert.match(runner, /if \(enabled\)[\s\S]*require\('pg'\)/);
  assert.match(runner, /POS_RETURNS_FIXTURE/);
});

test('return RPC is invoked with authenticated JWT claims, never as an anonymous user', () => {
  assert.match(runner, /request\.jwt\.claim\.sub/);
  assert.match(runner, /SET LOCAL ROLE authenticated/);
  assert.match(runner, /pos_devolucion_registrar_auth/);
});

test('normal scenarios and expected failures always roll back their transaction', () => {
  assert.match(runner, /await client\.query\('ROLLBACK'\)/);
  assert.match(runner, /SAVEPOINT before_expected_failure/);
  assert.match(runner, /ROLLBACK TO SAVEPOINT before_expected_failure/);
  assert.doesNotMatch(runner, /await client\.query\('COMMIT'\)/);
});

test('FEFO trace, payments, cash ledger and idempotent replay are asserted', () => {
  for (const token of [
    'devolucion_venta_lote', 'inventario_lote', 'devolucion_venta_pago',
    'caja_movimiento', 'trazabilidadRepetida', 'replay must not duplicate stock, lots, payments or cash'
  ]) assert.ok(runner.includes(token), `missing integration assertion: ${token}`);
});

test('fixtures require explicit tenant, branch and source stock identifiers', () => {
  assert.match(runner, /fixture\.authUserId/);
  assert.match(runner, /scenario\.comprobanteId/);
  assert.match(runner, /spec\.empresaId/);
  assert.match(runner, /spec\.sucursalId/);
  assert.match(runner, /spec\.stock\.productId/);
});
