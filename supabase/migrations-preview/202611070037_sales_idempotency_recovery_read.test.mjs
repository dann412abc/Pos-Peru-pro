import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sql = readFileSync(fileURLToPath(new URL('./202611070037_sales_idempotency_recovery_read.sql', import.meta.url)), 'utf8');
const api = readFileSync(resolve(root, 'frontend/src/api/supabaseSales.ts'), 'utf8');
const edge = readFileSync(resolve(root, 'frontend/functions/api/edge/[[path]].js'), 'utf8');
const release = readFileSync(resolve(root, 'docs/VENTAS-SUPABASE-FRONTEND-INTEGRACION-v1.44.54.md'), 'utf8');

test('recovery RPC derives identity and company from auth.uid()', () => {
  assert.match(sql, /v_auth uuid := auth\.uid\(\)/);
  assert.match(sql, /supabase_auth_user_id = v_auth/);
  assert.match(sql, /u\.empresa_id/);
});

test('recovery validates branch assignment and payload SHA-256', () => {
  assert.match(sql, /public\.usuario_sucursal/);
  assert.match(sql, /sha256\(convert_to\(\(p_payload - 'idempotencyKey'\)::text, 'UTF8'\)\)/);
  assert.match(sql, /IDEMPOTENCY_KEY_PAYLOAD_CONFLICT/);
});

test('recovery is read-only and returns payment details', () => {
  assert.match(sql, /SALE_CONFIRMED/);
  assert.match(sql, /jsonb_agg/);
  assert.match(sql, /public\.comprobante_pago/);
  assert.doesNotMatch(sql, /\b(INSERT INTO|UPDATE public\.|DELETE FROM)\b/i);
});

test('recovery does not require an open cash register', () => {
  assert.doesNotMatch(sql, /public\.caja/);
  assert.match(sql, /pos_venta_idempotencia_consultar_auth/);
});

test('frontend only consults recovery after ambiguous create response', () => {
  assert.match(api, /consultarEstadoVentaSupabase\(payload\)/);
  assert.match(api, /if \(recovery\.existente\) return convertirRecuperacion/);
  assert.match(api, /la solicitud podría seguir en curso/);
  assert.match(edge, /sales\/idempotency-check/);
});

test('documents same-key retry and disabled activation', () => {
  assert.match(release, /misma clave/);
  assert.match(release, /false/);
  assert.match(release, /No se ejecutó en Supabase/);
});
