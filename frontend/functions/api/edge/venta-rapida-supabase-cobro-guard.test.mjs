import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../../src/pages/VentaRapida.tsx'), 'utf8');

test('Supabase mode blocks legacy NestJS sale posting before API call', () => {
  const guard = source.indexOf("if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {");
  const post = source.indexOf("api.post('/ventas', payload)");
  assert.ok(guard >= 0, 'missing Supabase checkout guard');
  assert.ok(post > guard, 'guard must execute before legacy sale endpoint');
  assert.match(source.slice(guard, post), /no se permite enviar ventas al backend NestJS|No se permite enviar ventas al backend NestJS/);
});

test('Supabase mode cannot fall through to the legacy offline queue', () => {
  const guard = source.indexOf("if (import.meta.env.VITE_AUTH_PROVIDER === 'supabase') {");
  const offlineQueue = source.indexOf('await guardarVentaOffline(venta, payload)', guard);
  assert.ok(guard >= 0);
  assert.ok(offlineQueue > guard, 'legacy queue remains only after the Supabase guard');
});

test('legacy and demo paths remain present', () => {
  assert.match(source, /if \(ES_MODO_DEMO\)/);
  assert.match(source, /api\.post\('\/ventas', payload\)/);
});
