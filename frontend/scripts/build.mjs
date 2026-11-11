import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };

// Enable Supabase Auth only in this dedicated Cloudflare Pages Preview branch.
// Production (main) and all other branches keep their existing build environment.
if (env.CF_PAGES_BRANCH === 'fix/password-recovery-flow') {
  env.VITE_AUTH_PROVIDER = 'supabase';
}

const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const result = spawnSync(process.execPath, [viteCli, 'build'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
