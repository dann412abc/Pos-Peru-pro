import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');

test('Dashboard does not call the legacy NestJS endpoint in Supabase Auth mode', () => {
  assert.match(source, /ES_SUPABASE_AUTH/);
  assert.match(source, /if \(ES_SUPABASE_AUTH\) \{/);
  assert.match(source, /setData\(null\)/);
  assert.match(source, /setCargando\(false\)/);
  assert.match(source, /No se consultó la API heredada/);
});

test('Dashboard retains the legacy request only outside Supabase Auth mode', () => {
  assert.match(source, /api\.get\('\/gastos\/reportes\/dashboard-gerencial'\)/);
  assert.ok(source.indexOf('if (ES_SUPABASE_AUTH) {') < source.indexOf("api.get('/gastos/reportes/dashboard-gerencial')"));
});
