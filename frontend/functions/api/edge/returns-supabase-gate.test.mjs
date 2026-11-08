import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const page=fs.readFileSync(path.join(here,'../../../src/pages/Devoluciones.tsx'),'utf8');
const client=fs.readFileSync(path.join(here,'../../../src/api/client.ts'),'utf8');
test('auth provider Supabase is exported explicitly for module routing',()=>{
 assert.match(client,/export const ES_SUPABASE_AUTH = SUPABASE_AUTH/);
});
test('Devoluciones does not call legacy endpoints while Supabase Auth is active',()=>{
 assert.match(page,/if \(ES_MODO_DEMO \|\| ES_SUPABASE_AUTH \|\| !sucursalId\) return/);
 assert.match(page,/if \(!ES_SUPABASE_AUTH\) recargar\(\)/);
 assert.match(page,/if \(ES_SUPABASE_AUTH\) return/);
 assert.match(page,/API antigua/);
});
test('legacy flow remains available outside Supabase Auth mode',()=>{
 assert.match(page,/api\.post\(`\/devoluciones\/ventas\/\$\{disponibilidad\.comprobante\.id\}`/);
 assert.match(page,/api\.get\('\/devoluciones'/);
});
