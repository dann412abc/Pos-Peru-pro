import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('frontend/functions/api/edge/[[path]].js','utf8');
const client=fs.readFileSync('frontend/src/api/supabaseInventory.ts','utf8');
const page=fs.readFileSync('frontend/src/pages/Productos.tsx','utf8');

test('Cloudflare exposes authenticated inventory adjustment RPC with strict payload validation',()=>{
  assert.match(edge,/route === 'inventory\/adjust'/);
  assert.match(edge,/pos_inventario_ajustar_lote_auth/);
  assert.match(edge,/INVENTORY_ADJUSTMENT_MIGRATION_REQUIRED/);
  assert.match(edge,/idempotencyKey/);
  assert.match(edge,/varianteId/);
});

test('Supabase client requires a real session and confirms lot traceability',()=>{
  assert.match(client,/getAccessToken\(\)/);
  assert.match(client,/Bearer \\${token\\}/);
  assert.match(client,/trazabilidadLotes !== true/);
  assert.match(client,/\/api\/edge\/inventory\/adjust/);
});

test('product and variant adjustment screens use the same lot-aware client in Supabase mode',()=>{
  assert.match(page,/registrarAjusteInventarioSupabase/);
  assert.match(page,/VITE_AUTH_PROVIDER === 'supabase'/);
});
