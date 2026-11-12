import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/pages/VentaRapida.tsx', import.meta.url), 'utf8');
const salesAdapter = await readFile(new URL('../../src/api/supabaseSales.ts', import.meta.url), 'utf8');
const envExample = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');

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

test('El adaptador de ventas usa Edge autenticado y exige confirmación FEFO', () => {
  assert.match(source, /crearVentaSupabase\(payloadSupabase\)/);
  assert.match(salesAdapter, /axios\.post\('\/api\/edge\/sales\/register', \{ payload \}/);
  assert.match(salesAdapter, /result\.trazabilidadFEFO !== true/);
  assert.match(salesAdapter, /consultarEstadoVentaSupabase\(payload\)/);
  assert.match(salesAdapter, /idempotencyKey/);
});

test('El cobro Supabase permanece bloqueado por defecto hasta habilitación controlada', () => {
  assert.match(envExample, /VITE_SUPABASE_SALES_ENABLED=false/);
  assert.match(source, /VITE_SUPABASE_SALES_ENABLED !== 'true'/);
});
