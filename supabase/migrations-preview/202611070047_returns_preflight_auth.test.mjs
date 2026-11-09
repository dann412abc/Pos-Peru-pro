import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const file = path.join(process.cwd(), 'supabase/migrations-preview/202611070047_returns_preflight_auth.sql');
const sql = fs.readFileSync(file, 'utf8');
test('preflight is authenticated and does not grant anonymous execution', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_devolucion_prevalidar_auth\(integer,jsonb\) TO authenticated/);
  assert.match(sql, /FROM PUBLIC,anon/);
});
test('preflight locks receipt, cash register and receipt lines', () => {
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /estado='ABIERTA'/);
  assert.match(sql, /comprobante_linea/);
});
test('preflight validates available quantity, payment totals and Yape/Plin reference', () => {
  assert.match(sql, /supera la disponible/);
  assert.match(sql, /v_pago<>v_reembolso/);
  assert.match(sql, /YAPE.*PLIN/s);
});
test('preflight shares the backend idempotency lock domain and does not compute a misleading hash', () => {\n  assert.match(sql,/mi-carrito-pos:devolucion:/);\n  assert.doesNotMatch(sql,/pos-return-preflight:/);\n  assert.doesNotMatch(sql,/v_hash|md5\\(/);\n});\ntest('preflight is explicitly non-mutating', () => {
  assert.doesNotMatch(sql, /INSERT INTO public\.devolucion_venta\s*\(/i);
  assert.doesNotMatch(sql, /UPDATE public\.(producto_stock|producto_variante_stock|caja_movimiento|cuenta_cobrar)/i);
  assert.match(sql, /No se ha registrado ni modificado ningún dato/);
});
