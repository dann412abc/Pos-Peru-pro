import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/ResetPassword.tsx', import.meta.url), 'utf8');

test('recovery page accepts token_hash and raw token query callbacks only for recovery type', () => {
  assert.match(source, /query\.get\('token_hash'\)/);
  assert.match(source, /query\.get\('type'\) === 'recovery' \? query\.get\('token'\) : null/);
  assert.match(source, /supabaseAuthVerifyRecovery\(tokenHash\)/);
});
