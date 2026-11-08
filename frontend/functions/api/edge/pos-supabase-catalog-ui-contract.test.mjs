import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../../src/pages/VentaRapida.tsx', import.meta.url), 'utf8');

test('Venta Rápida carga productos y clientes desde el catálogo Supabase', () => {
  assert.match(source, /fetchCurrentSupabaseCatalog\(sucursalId\)/);
  assert.match(source, /mapSupabaseProductRows\(catalogoSupabase\)/);
  assert.match(source, /mapSupabaseCustomerRows\(catalogoSupabase\)/);
});

test('Venta Rápida consulta variantes desde el catálogo Supabase', () => {
  assert.match(source, /mapSupabasePurchaseVariants\(await fetchCurrentSupabaseCatalog\(sucursalId\), Number\(p\.id\)\)/);
});

test('El escáner de variantes busca códigos en el catálogo Supabase', () => {
  assert.match(source, /catalogoVariantes\(catalog\)/);
  assert.match(source, /codigo_barras \?\? x\.codigoBarras/);
});

test('El cobro aún está explícitamente pendiente de migración Supabase', () => {
  assert.match(source, /api\.post\('\/ventas', payload\)/);
});
