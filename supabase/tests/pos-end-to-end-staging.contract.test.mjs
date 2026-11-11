import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sales = readFileSync(resolve(here, 'sales-transaction-staging.integration.test.mjs'), 'utf8');
const purchases = readFileSync(resolve(here, 'purchase-receipt-staging.integration.test.mjs'), 'utf8');
const returns = readFileSync(resolve(here, 'returns-transaction-staging.integration.test.mjs'), 'utf8');

test('el recorrido completo tiene arneses transaccionales para compra, venta y devolución', () => {
  assert.match(purchases, /pos_compra_recibir_auth/);
  assert.match(sales, /pos_registrar_venta_fefo_auth/);
  assert.match(returns, /pos_devolucion_registrar_auth/);
  assert.match(sales, /purchasePrerequisite/);
  assert.match(sales, /pos_compra_recibir_auth/);
  assert.match(sales, /pos_comprobante_detalle_auth/);
});

test('compra y venta pueden ejecutarse en la misma transacción autenticada', () => {
  assert.match(sales, /beginAsAuthenticated\(client, fixture\.authUserId\)/);
  assert.match(sales, /await setAuthenticatedRole\(client\);[\s\S]*pos_compra_recibir_auth/);
  assert.match(sales, /await setPrivilegedAssertionRole\(client\);[\s\S]*const before = await readSnapshot/);
  assert.match(sales, /await client\.query\('ROLLBACK'\)/);
});

test('devolución valida restitución FEFO, reembolso, caja y replay idempotente', () => {
  for (const token of [
    'devolucion_venta_lote', 'inventario_lote', 'devolucion_venta_pago',
    'caja_movimiento', 'stockDelta', 'replay must not duplicate stock, lots, payments or cash'
  ]) assert.ok(returns.includes(token), `falta comprobación de devolución: ${token}`);
});

test('todos los arneses exigen opt-in y fixture antes de abrir conexión', () => {
  assert.match(purchases, /POS_PURCHASE_STAGING_CONFIRM === 'YES'/);
  assert.match(sales, /POS_SALES_STAGING_CONFIRM === 'YES'/);
  assert.match(returns, /POS_RETURNS_STAGING_CONFIRM === 'YES'/);
  for (const source of [purchases, sales, returns]) {
    assert.match(source, /Boolean\(fixturePath\)/);
    assert.match(source, /if \(enabled\)[\s\S]*require\('pg'\)/);
  }
});

test('ningún flujo normal confirma datos y los fallos esperados usan savepoint', () => {
  for (const source of [purchases, sales, returns]) {
    assert.match(source, /SAVEPOINT before_expected_failure/);
    assert.match(source, /ROLLBACK TO SAVEPOINT before_expected_failure/);
    assert.match(source, /await client\.query\('ROLLBACK'\)/);
  }
  assert.doesNotMatch(returns, /await client\.query\('COMMIT'\)/);
});

test('la prueba de concurrencia que confirma datos requiere una segunda autorización', () => {
  assert.match(purchases, /POS_PURCHASE_ALLOW_COMMIT_TESTS === 'YES'/);
  assert.match(sales, /POS_SALES_ALLOW_COMMIT_TESTS === 'YES'/);
  assert.match(returns, /does not match/); // devoluciones no habilitan commit concurrente
});
