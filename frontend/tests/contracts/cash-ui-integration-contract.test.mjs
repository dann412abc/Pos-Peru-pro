import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../../src/pages/CierreCaja.tsx', import.meta.url), 'utf8');
const helper = await readFile(new URL('../../src/api/supabaseCash.ts', import.meta.url), 'utf8');
const client = await readFile(new URL('../../src/api/client.ts', import.meta.url), 'utf8');

test('CierreCaja selecciona el flujo Supabase sin retirar el flujo legado', () => {
  assert.match(page, /ES_SUPABASE_AUTH/);
  assert.match(page, /listarCajasAbiertasComprasSupabase\(sucursalId\)/);
  assert.match(page, /fetchSupabaseCashSummary\(cajaActual\.id\)/);
  assert.match(page, /openSupabaseCash\(/);
  assert.match(page, /registerSupabaseCashMovement\(/);
  assert.match(page, /closeSupabaseCash\(/);
  assert.match(page, /api\.post\('\/caja\/apertura'/);
  assert.match(page, /api\.post\(`\/caja\/\$\{caja\.id\}\/cierre`/);
});

test('helpers Supabase exigen sesión y validan confirmaciones de RPC', () => {
  for (const name of ['openSupabaseCash', 'registerSupabaseCashMovement', 'closeSupabaseCash']) assert.match(helper, new RegExp(`export async function ${name}`));
  assert.match(helper, /Inicia sesión con Supabase/);
  assert.match(helper, /response\.data\.ok !== true/);
  assert.match(client, /export const ES_SUPABASE_AUTH = SUPABASE_AUTH/);
});
