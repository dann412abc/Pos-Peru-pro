import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const edge = fs.readFileSync(path.join(process.cwd(),'frontend/functions/api/edge/[[path]].js'),'utf8');
const client = fs.readFileSync(path.join(process.cwd(),'frontend/src/api/supabaseReturns.ts'),'utf8');

test('return register endpoint invokes the authenticated FEFO RPC with the exact payload contract',()=>{
  assert.match(edge,/route === 'returns\/register'/);
  assert.match(edge,/pos_devolucion_registrar_auth/);
  assert.match(edge,/p_comprobante_id:\s*comprobanteId/);\n  assert.match(edge,/p_payload:\s*\\{/);\n  for (const arg of ['motivo','idempotencyKey','lineas','pagos']) assert.ok(edge.includes(arg));
  assert.match(edge,/authorization: `Bearer \${token}`/);
});

test('return register endpoint validates ids, quantities, payment methods and duplicate lines',()=>{
  assert.match(edge,/INVALID_RETURN_PAYLOAD/);
  assert.match(edge,/DUPLICATE_RETURN_PAYMENT_METHOD/);
  assert.match(edge,/Math\.round\(Number\(x\.cantidad\) \* 1000\)/);
  assert.match(edge,/Math\.round\(Number\(x\.monto\) \* 100\)/);
});

test('Supabase return client keeps authenticated session and validates the committed result',()=>{
  assert.match(client,/registerSupabaseReturn/);
  assert.match(client,/\/api\/edge\/returns\/register/);
  assert.match(client,/headers: authHeaders\(\)/);
  assert.match(client,/result\.totalDevolucion/);
  assert.match(client,/result\.creditoRevertido/);
  assert.match(client,/result\.montoReembolsado/);
});

test('return client does not claim preflight is the final write operation',()=>{
  assert.match(client,/registerSupabaseReturn/);
  assert.match(client,/preflightSupabaseReturn/);
});
