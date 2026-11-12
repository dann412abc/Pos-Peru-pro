import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/api/health.js';

test('Pages health endpoint reports release and server-side configuration only', async () => {
  const response = await onRequest({ env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key' } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.deployment, 'cloudflare-pages');
  assert.equal(body.version, '1.44.77');
  assert.equal(body.supabaseConfigured, true);
  assert.equal(body.legacyApiConfigured, false);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
});

test('Pages health endpoint does not expose secret values', async () => {
  const response = await onRequest({ env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'never-return-this' } });
  const text = await response.text();
  assert.equal(text.includes('never-return-this'), false);
});
