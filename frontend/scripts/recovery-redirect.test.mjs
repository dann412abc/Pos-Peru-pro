import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/api/supabaseAuth.ts', import.meta.url), 'utf8');

test('password recovery always returns to the dedicated Preview hostname', () => {
  assert.match(source, /https:\/\/fix-password-recovery-flow\.pos-peru-pro\.pages\.dev/);
  assert.match(source, /redirect_to:/);
});
