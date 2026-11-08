import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./202611070021_sales_idempotency_sha256.sql', import.meta.url), 'utf8');

test('uses a 64-character SHA-256 request hash', () => {
  assert.match(sql, /request_hash\s+varchar\(64\)/i);
  assert.match(sql, /encode\(sha256\(convert_to\(/i);
  assert.match(sql, /length\(v_existing\.request_hash\)\s*<>\s*64/i);
  assert.doesNotMatch(sql, /\bmd5\s*\(/i);
});

test('keeps the lookup scoped to authenticated company and assigned branch', () => {
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /supabase_auth_user_id\s*=\s*v_auth/i);
  assert.match(sql, /s\.empresa_id\s*=\s*v_empresa/i);
  assert.match(sql, /us\.usuario_id\s*=\s*v_usuario/i);
});

test('does not create a sale or change stock/cash/payment records', () => {
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.(comprobante|comprobante_linea|comprobante_pago|movimiento_inventario|caja_movimiento)/i);
  assert.doesNotMatch(sql, /UPDATE\s+public\.(producto_stock|producto_variante_stock|inventario_lote|caja)\b/i);
});
