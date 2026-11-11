import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../../../functions/api/edge/[[path]].js', import.meta.url), 'utf8');

test('Supabase recovery redirect is passed as URL query parameter, not JSON body', () => {
  const start = edge.indexOf("route === 'auth/recover'");
  assert.notEqual(start, -1, 'auth/recover route must exist');
  const end = edge.indexOf("route === 'auth/me'", start);
  const handler = edge.slice(start, end);
  assert.match(handler, /recoveryUrl\.searchParams\.set\('redirect_to', body\.redirect_to\)/);
  assert.match(handler, /body: JSON\.stringify\(\{ email: body\.email\.trim\(\)\.toLowerCase\(\) \}\)/);
  assert.doesNotMatch(handler, /JSON\.stringify\(\{[^}]*redirect_to/);
});
