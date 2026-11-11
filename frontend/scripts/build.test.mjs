import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('./build.mjs', import.meta.url), 'utf8');

test('Supabase Auth is enabled only for the dedicated Preview branch', () => {
  assert.match(script, /CF_PAGES_BRANCH === 'fix\/password-recovery-flow'/);
  assert.match(script, /env\.VITE_AUTH_PROVIDER = 'supabase'/);
  assert.match(script, /Production \(main\) and all other branches keep their existing build environment/);
});
