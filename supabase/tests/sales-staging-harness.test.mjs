import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('./sales-transaction-staging.integration.test.mjs', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../docs/VENTAS-SUPABASE-PRUEBAS-STAGING-v1.44.52.md', import.meta.url), 'utf8');

test('el arnés exige doble confirmación y fixture antes de conectarse', () => {
  assert.match(runner, /POS_SALES_STAGING_CONFIRM === 'YES'/);
  assert.match(runner, /Boolean\(fixturePath\)/);
  assert.match(runner, /if \(enabled\)[\s\S]*require\('pg'\)/);
});

test('el arnés deriva identidad JWT de prueba y asume rol authenticated', () => {
  assert.match(runner, /request\.jwt\.claim\.sub/);
  assert.match(runner, /SET LOCAL ROLE authenticated/);
  assert.match(runner, /pos_registrar_venta_fefo_auth/);
  assert.doesNotMatch(runner, /SELECT public\.pos_venta_crear_auth/);
});

test('los escenarios normales revierten la transacción y el fallo usa savepoint', () => {
  assert.match(runner, /await client\.query\('ROLLBACK'\)/);
  assert.match(runner, /SAVEPOINT before_expected_failure/);
  assert.match(runner, /ROLLBACK TO SAVEPOINT before_expected_failure/);
  assert.match(runner, /SALE_FEFO_STOCK_MISMATCH/);
});

test('la concurrencia con commit exige una confirmación adicional', () => {
  assert.match(runner, /POS_SALES_ALLOW_COMMIT_TESTS === 'YES'/);
  assert.match(runner, /await first\.query\('COMMIT'\)/);
  assert.match(guide, /queda persistido/);
});

test('la guía prohíbe producción y explica los requisitos del fixture', () => {
  assert.match(guide, /No ejecutar contra producción/);
  assert.match(guide, /authUserId/);
  assert.match(guide, /rollbackCase/);
  assert.match(guide, /PGPASSWORD/);
});


test('la prueba concurrente verifica efectos financieros e inventario exactamente una vez', () => {
  assert.match(runner, /scenario\.expected\.paymentCount/);
  assert.match(runner, /scenario\.expected\.inventoryMovementCount/);
  assert.match(runner, /scenario\.expected\.lotOutputCount/);
  assert.match(runner, /scenario\.expected\.cashMovementCount/);
  assert.match(runner, /concurrent retry must decrement stock exactly once/);
  assert.match(runner, /concurrent retry must apply customer credit exactly once/);
});


test('el caso concurrente exige conteos esperados explícitos antes de confirmar', () => {
  assert.match(runner, /scenario\.expected\?\.\[field\]/);
  assert.match(runner, /must be a non-negative integer/);
});

test('la venta usa el wrapper FEFO y captura el saldo de cada lote', () => {
  assert.match(runner, /pos_registrar_venta_fefo_auth/);
  assert.match(runner, /cantidad_disponible/);
  assert.match(runner, /lotAvailabilityAfterSale/);
  assert.match(runner, /fefoLotCodes/);
});

test('permite recibir una compra y vender su lote en la misma transacción', () => {
  assert.match(runner, /purchasePrerequisite/);
  assert.match(runner, /pos_compra_recibir_auth/);
  assert.match(runner, /receivedLots/);
  assert.match(runner, /ROLLBACK/);
});
