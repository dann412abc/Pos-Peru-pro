import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const purchases = fs.readFileSync('frontend/src/api/supabasePurchases.ts', 'utf8');
const returns = fs.readFileSync('frontend/src/api/supabaseReturns.ts', 'utf8');

test('purchase stock writers translate the open physical-count conflict for operators', () => {
  assert.match(purchases, /function rethrowInventoryCountConflict/);
  assert.match(purchases, /data\?\.error === 'INVENTORY_COUNT_OPEN'/);
  assert.match(purchases, /Cierra el conteo antes de recibir o devolver compras/);
  for (const route of ['/api/edge/purchases/receive', '/api/edge/purchases/return', '/api/edge/purchases/cancel']) {
    const index = purchases.indexOf(route);
    assert.notEqual(index, -1, `missing purchase route ${route}`);
    assert.match(purchases.slice(index - 100, index + 400), /rethrowInventoryCountConflict\(error\)/);
  }
});

test('sales return preserves same idempotency key and explains count lock without retrying a mutation', () => {
  assert.match(returns, /idempotencyKey: key/);
  assert.match(returns, /data\?\.error === 'INVENTORY_COUNT_OPEN'/);
  assert.match(returns, /Cierra el conteo antes de registrar la devolución/);
  assert.match(returns, /throw error;/);
});
