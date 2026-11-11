import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/VentaRapida.tsx', import.meta.url), 'utf8');

test('POS explains missing catalog migration instead of implying products were deleted', () => {
  assert.match(source, /status === 409 && code === 'CATALOG_MIGRATION_REQUIRED'/);
  assert.match(source, /Falta instalar la función segura pos_catalogo_base_auth/);
  assert.match(source, /No se han perdido tus productos/);
  assert.match(source, /errorCatalogo &&/);
});
