import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const manifests = [
  'frontend/package.json',
  'frontend/package-lock.json',
  'backend/package.json',
  'backend/package-lock.json',
];

if (!/^\d+\.\d+\.\d+$/.test(expected)) {
  throw new Error(`VERSION no tiene formato semver válido: ${expected || '(vacío)'}`);
}

const mismatches = [];
for (const relative of manifests) {
  const file = path.join(root, relative);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    mismatches.push(`${relative}: JSON inválido (${error.message})`);
    continue;
  }
  if (parsed.version !== expected) mismatches.push(`${relative}: ${parsed.version ?? '(sin versión)'} != ${expected}`);
  if (relative.endsWith('package-lock.json') && parsed.packages?.['']?.version !== expected) {
    mismatches.push(`${relative}: packages[""].version no coincide con ${expected}`);
  }
}

if (mismatches.length) {
  console.error(`ERROR: versión release ${expected} inconsistente.`);
  for (const item of mismatches) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`OK: VERSION y ${manifests.length} manifiestos/lockfiles coinciden en ${expected}.`);
}
