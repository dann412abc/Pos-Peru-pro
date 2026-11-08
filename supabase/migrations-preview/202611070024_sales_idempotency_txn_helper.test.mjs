import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations-preview/202611070024_sales_idempotency_txn_helper.sql'), 'utf8');

test('valida empresa, clave y huella SHA-256 de 64 caracteres', () => {
  assert.match(sql, /p_empresa_id\s+IS NULL/i);
  assert.match(sql, /\^\[A-Za-z0-9\._:-\]\{12,100\}\$/);
  assert.match(sql, /\^\[0-9a-f\]\{64\}\$/);
});

test('serializa solicitudes iguales dentro de la transacción', () => {
  assert.match(sql, /pg_advisory_xact_lock\s*\(/i);
  assert.match(sql, /p_empresa_id::text\s*\|\|\s*':'\s*\|\|\s*p_idempotency_key/i);
});

test('busca por empresa y clave y bloquea el comprobante existente', () => {
  assert.match(sql, /c\.empresa_id\s*=\s*p_empresa_id/i);
  assert.match(sql, /c\.idempotency_key\s*=\s*p_idempotency_key/i);
  assert.match(sql, /FOR UPDATE/i);
});

test('misma clave con hash distinto se rechaza; hash igual devuelve comprobante', () => {
  assert.match(sql, /v_existing\.request_hash\s*<>\s*p_request_hash/i);
  assert.match(sql, /IDEMPOTENCY_KEY_PAYLOAD_CONFLICT/);
  assert.match(sql, /RETURN_EXISTING/);
  assert.match(sql, /CONTINUE_CREATE/);
});

test('no concede ejecución directa a roles de cliente y no escribe ventas', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION .* FROM PUBLIC/i);
  assert.match(sql, /FROM anon/i);
  assert.match(sql, /FROM authenticated/i);
  assert.doesNotMatch(sql, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
});

test('documenta que la restricción UNIQUE sigue siendo la garantía final', () => {
  assert.match(sql, /índice UNIQUE/i);
  assert.match(sql, /unique_violation/i);
});
