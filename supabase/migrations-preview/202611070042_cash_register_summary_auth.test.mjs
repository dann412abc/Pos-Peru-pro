import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('./202611070042_cash_register_summary_auth.sql', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../../frontend/functions/api/edge/[[path]].js', import.meta.url), 'utf8');
test('resumen de caja deriva identidad de auth.uid y valida empresa/sucursal/propietario', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /supabase_auth_user_id=v_auth/);
  assert.match(sql, /s\.empresa_id=v_empresa/);
  assert.match(sql, /c\.usuario_id=v_usuario/);
  assert.match(sql, /usuario_sucursal/);
});
test('el resumen desglosa medios de pago y calcula efectivo con saldo inicial y movimientos', () => {
  for (const method of ['EFECTIVO','TARJETA','YAPE','PLIN','CREDITO']) assert.match(sql, new RegExp(method));
  assert.match(sql, /saldo_inicial/);
  assert.match(sql, /caja_movimiento/);
  assert.match(sql, /efectivoEsperado/);
});
test('RPC de lectura no concede ejecución pública o anónima', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_caja_resumen_auth\(integer\) FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_caja_resumen_auth\(integer\) FROM anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_caja_resumen_auth\(integer\) TO authenticated/);
});
test('Cloudflare exige Bearer y llama RPC de resumen autorizada', () => {
  assert.match(edge, /cash\/summary/);
  assert.match(edge, /pos_caja_resumen_auth/);
  assert.match(edge, /getBearer\(request\)/);
});
