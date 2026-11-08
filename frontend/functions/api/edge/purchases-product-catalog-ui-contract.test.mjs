import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../../../src/api/supabasePurchases.ts', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../../../src/api/supabaseCatalog.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../../../src/pages/Compras.tsx', import.meta.url), 'utf8');

test('consulta productos del catálogo Supabase para la sucursal', () => {
  assert.match(api, /fetchSupabasePurchaseProducts/);
  assert.match(api, /fetchCurrentSupabaseCatalog\(sucursalId\)/);
  assert.match(api, /mapSupabaseProductRows\(catalog\)/);
});

test('consulta variantes activas y stock/costo por sucursal', () => {
  assert.match(api, /fetchSupabasePurchaseVariants/);
  assert.match(catalog, /mapSupabasePurchaseVariants/);
  assert.match(catalog, /stock_variantes/);
  assert.match(catalog, /costoPromedio/);
});

test('pantalla Compras no usa endpoint NestJS de productos/variantes en modo Supabase', () => {
  assert.match(page, /fetchSupabasePurchaseProducts\(sucursalId\)/);
  assert.match(page, /fetchSupabasePurchaseVariants\(sucursalId, productoId\)/);
  assert.match(page, /modoSupabase \? Promise\.resolve\(\{ data: productosSupabase \}\) : api\.get\('\/productos'/);
});


test('alertas de vencimiento usan Cloudflare/Supabase en modo Supabase', () => {
  assert.match(api, /fetchSupabaseInventoryExpiries/);
  assert.match(page, /modoSupabase \? await fetchSupabaseInventoryExpiries\(sucursalId, 30\)/);
  assert.match(page, /api\.get\('\/inventario\/vencimientos'/);
});
