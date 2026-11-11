import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const handler = await readFile(new URL('../functions/api/edge/auth/password.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/pages/ResetPassword.tsx', import.meta.url), 'utf8');

test('password update handler preserves safe Supabase error code and message', () => {
  assert.match(handler, /providerError\.code/);
  assert.match(handler, /providerError\.message/);
  assert.match(handler, /providerMessage/);
  assert.match(handler, /PASSWORD_UPDATE_FAILED/);
});

test('reset password UI displays actionable provider diagnostics', () => {
  assert.match(page, /data\?\.providerMessage/);
  assert.match(page, /Detalle Supabase/);
});
