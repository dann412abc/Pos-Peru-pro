import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ui = readFileSync(new URL('../../../src/pages/Compras.tsx', import.meta.url), 'utf8');
test('Supabase purchase screen calls the transactional receive client', () => {
  assert.match(ui, /recibirCompraSupabase, fetchSupabasePurchases, fetchSupabasePurchaseDetail, registrarPagoCompraSupabase/);
  assert.match(ui, /VITE_AUTH_PROVIDER === 'supabase'[\s\S]{0,150}recibirCompraSupabase\(payload as any\)/);
  assert.match(ui, /await fetchSupabasePurchases\(sucursalId\)/);
  assert.match(ui, /fetchSupabasePurchaseDetail\(sucursalId, id\)/);
});
test('purchase submit is locked and reuses idempotency key for retry', () => {
  assert.match(ui, /if \(guardandoCompra\) return/);
  assert.match(ui, /idempotencyKey: claveCompra/);
  assert.match(ui, /setGuardandoCompra\(true\)/);
  assert.match(ui, /finally \{\s*setGuardandoCompra\(false\)/);
});
test('success is shown only after a purchase identifier is returned', () => {
  assert.match(ui, /const compraId = Number\(\(respuesta as any\)\?\.compraId \|\| \(respuesta as any\)\?\.id \|\| 0\)/);
  assert.match(ui, /if \(\(respuesta as any\)\?\.ok === false \|\| !compraId\)/);
});

test('Supabase purchase payment screen calls the payment RPC client and retains idempotency on retry', () => {
  assert.match(ui, /registrarPagoCompraSupabase\(payload\)/);
  assert.match(ui, /idempotencyKey: clavePago/);
  assert.match(ui, /setClavePago\(`purchase-payment-\$\{crypto\.randomUUID\(\)\}`\)/);
});

test('Supabase supplier return screen uses the atomic return client', () => {
  assert.match(ui, /registrarDevolucionProveedorSupabase\(/);
  assert.match(ui, /VITE_AUTH_PROVIDER === 'supabase'[\s\S]{0,180}registrarDevolucionProveedorSupabase/);
});
