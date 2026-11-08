import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge = fs.readFileSync(new URL('./[[path]].js', import.meta.url), 'utf8');
const rpc = fs.readFileSync(new URL('../../../../supabase/migrations-preview/202611070018_inventory_expiry_read_rpc.sql', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../../src/api/supabasePurchases.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../../../src/pages/Vencimientos.tsx', import.meta.url), 'utf8');

test('endpoint de vencimientos exige token y valida sucursal/rango', () => {
  assert.match(edge, /route === 'inventory\/expiries'/);
  assert.match(edge, /if \(!token\).*UNAUTHORIZED/s);
  assert.match(edge, /\[30, 60, 90, 180, 365\]\.includes\(dias\)/);
  assert.match(edge, /pos_inventario_vencimientos_auth/);
});

test('RPC deriva empresa desde auth.uid y verifica sucursal del usuario', () => {
  assert.match(rpc, /auth\.uid\(\)/);
  assert.match(rpc, /usuario_sucursal/);
  assert.match(rpc, /s\.empresa_id=v_empresa/);
  assert.match(rpc, /cantidad_disponible>0/);
  assert.match(rpc, /fecha_vencimiento IS NOT NULL/);
});

test('cliente y pantalla usan la ruta Supabase en modo Supabase', () => {
  assert.match(api, /fetchSupabaseInventoryExpiries/);
  assert.match(api, /\/api\/edge\/inventory\/expiries/);
  assert.match(page, /VITE_AUTH_PROVIDER==='supabase'/);
  assert.match(page, /fetchSupabaseInventoryExpiries/);
});
