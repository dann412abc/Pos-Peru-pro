import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070032_sales_writer_guard_staging_integration.sql', import.meta.url), 'utf8');

test('el harness exige identidad y payload reales de staging', () => {
  assert.match(sql, /\?auth_user_id/);
  assert.match(sql, /\?sale_payload/);
  assert.match(sql, /request\.jwt\.claim\.sub/);
  assert.match(sql, /SET LOCAL ROLE authenticated/i);
});

test('el harness ejecuta la barrera protegida, no una RPC de escritura', () => {
  assert.match(sql, /pos_venta_transaccion_guardia_auth\(:'sale_payload'::jsonb\)/i);
  assert.doesNotMatch(sql, /pos_venta_crear_auth\s*\(/i);
});

test('verifica la respuesta fail-closed y los seis indicadores negativos', () => {
  for (const token of ['WRITER_DISABLED', 'SALE_TRANSACTIONAL_WRITER_NOT_READY', 'saleCreated', 'paymentsCreated', 'inventoryChanged', 'cashMovementCreated', 'receivableCreated', 'correlativoConsumed']) {
    assert.ok(sql.includes(token), `falta ${token}`);
  }
});

test('compara contenido y cantidad de diez tablas operativas', () => {
  for (const table of ['comprobante', 'comprobante_linea', 'comprobante_pago', 'movimiento_inventario', 'comprobante_lote_salida', 'cuenta_cobrar', 'caja_movimiento', 'producto_stock', 'producto_variante_stock', 'serie_correlativo']) {
    assert.ok(sql.includes(`'${table}'`), `falta tabla ${table}`);
  }
  assert.match(sql, /content_hash/);
  assert.match(sql, /WRITER_GUARD_CHANGED_OPERATIONAL_TABLES/);
});

test('la prueba es reversible y advierte que requiere staging aislado', () => {
  assert.match(sql, /SOLO staging aislado y sin escrituras concurrentes/i);
  assert.match(sql, /BEGIN ISOLATION LEVEL REPEATABLE READ/i);
  assert.match(sql, /ROLLBACK;/i);
});
