import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Supabase checkout remains blocked until transactional RPC is installed', async () => {
  const source = await read('frontend/src/pages/VentaRapida.tsx');
  assert.match(source, /VITE_SUPABASE_SALES_ENABLED !== 'true'[\s\S]{0,220}bloqueado hasta completar las pruebas de staging/);
  assert.match(source, /api\.post\('\/ventas', payload\)/);
});

test('transactional sales audit documents auth identity and idempotency requirements', async () => {
  const doc = await read('docs/VENTAS-SUPABASE-AUDITORIA-TRANSACCIONAL-v1.44.32.md');
  assert.match(doc, /auth\.uid\(\)/);
  assert.match(doc, /Idempotencia fuerte/);
  assert.match(doc, /No se ejecuta SQL/);
  assert.match(doc, /no se habilita el cobro/);
});
