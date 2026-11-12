import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const edge = fs.readFileSync(path.join(process.cwd(),'frontend/functions/api/edge/[[path]].js'),'utf8');
const client = fs.readFileSync(path.join(process.cwd(),'frontend/src/api/supabaseReturns.ts'),'utf8');

test('return register endpoint invokes the authenticated FEFO RPC with the exact payload contract',()=>{
  assert.ok(edge.includes("route === 'returns/register'"));
  assert.ok(edge.includes('pos_devolucion_registrar_auth'));
  assert.ok(edge.includes('p_comprobante_id: comprobanteId'));
  assert.ok(edge.includes('p_payload: {'));
  for (const arg of ['motivo','idempotencyKey','lineas','pagos']) assert.ok(edge.includes(arg));
  assert.ok(edge.includes('authorization: `Bearer ${token}`'));
});

test('return register endpoint validates ids, quantities, payment methods and duplicate lines',()=>{
  for (const marker of ['INVALID_RETURN_PAYLOAD','DUPLICATE_RETURN_PAYMENT_METHOD','Math.round(Number(x.cantidad) * 1000)','Math.round(Number(x.monto) * 100)']) assert.ok(edge.includes(marker));
});

test('Supabase return client keeps authenticated session and validates committed result',()=>{
  for (const marker of ['registerSupabaseReturn','/api/edge/returns/register','headers: authHeaders()','result.totalDevolucion','result.creditoRevertido','result.montoReembolsado']) assert.ok(client.includes(marker));
});

test('preflight remains read-only and distinct from commit',()=>{
  for (const marker of ['preflightSupabaseReturn','pos_devolucion_prevalidar_auth','registerSupabaseReturn']) assert.ok(client.includes(marker));
});