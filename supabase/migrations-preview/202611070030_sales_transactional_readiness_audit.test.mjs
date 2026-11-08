import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations-preview/202611070030_sales_transactional_readiness_audit.sql', 'utf8');
const doc = readFileSync('docs/VENTAS-SUPABASE-CONTRATO-TRANSACCIONAL-READINESS-v1.44.45.md', 'utf8');

test('la auditoría solo consulta catálogos PostgreSQL y no modifica esquema ni datos', () => {
  assert.match(sql, /information_schema\.columns/i);
  assert.match(sql, /pg_indexes/i);
  assert.match(sql, /pg_constraint/i);
  assert.doesNotMatch(sql, /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\s+(TABLE|INDEX|FUNCTION|POLICY|INTO|public\.)/i);
});

test('comprueba columnas críticas de idempotencia, stock, lotes, crédito y pagos', () => {
  for (const token of [
    "('comprobante','request_hash')", "('comprobante','idempotency_key')",
    "('producto_stock','stock')", "('producto_variante_stock','stock')",
    "('inventario_lote','cantidad_disponible')", "('cuenta_cobrar','saldo_pendiente')",
    "('cliente','saldo_credito')"
  ]) assert.ok(sql.includes(token), `Falta auditoría: ${token}`);
});

test('comprueba índices únicos que protegen idempotencia, caja y correlativos', () => {
  for (const token of [
    'uq_comprobante_empresa_idempotency', 'uq_caja_abierta_sucursal_usuario',
    'uq_serie_correlativo_sucursal_tipo_serie', 'uq_comprobante_sucursal_tipo_serie_correlativo'
  ]) assert.ok(sql.includes(token));
});

test('documenta que pagos de venta ya alimentan caja y prohíbe duplicar caja_movimiento', () => {
  assert.match(doc, /no debe insertar un `caja_movimiento` adicional/i);
  assert.match(doc, /`comprobante_pago`/);
});

test('exige repetir las validaciones y locks dentro de la transacción final', () => {
  assert.match(doc, /dentro de su propia transacción/i);
  assert.match(doc, /idempotencia, caja, crédito, stock, lotes y correlativo/i);
  assert.match(doc, /No habilitar el botón Cobrar/i);
});
