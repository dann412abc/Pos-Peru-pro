import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const page = readFileSync(resolve(root, 'frontend/src/pages/VentaRapida.tsx'), 'utf8');
const api = readFileSync(resolve(root, 'frontend/src/api/supabaseSales.ts'), 'utf8');
const env = readFileSync(resolve(root, 'frontend/.env.example'), 'utf8');
const edge = readFileSync(resolve(root, 'frontend/functions/api/edge/[[path]].js'), 'utf8');
const docs = readFileSync(resolve(root, 'docs/VENTAS-SUPABASE-FRONTEND-INTEGRACION-v1.44.53.md'), 'utf8');

test('la bandera de ventas Supabase permanece apagada por defecto', () => {
  assert.match(env, /VITE_SUPABASE_SALES_ENABLED=false/);
  assert.match(page, /VITE_SUPABASE_SALES_ENABLED !== 'true'/);
});

test('la pantalla invoca la RPC y exige cliente real de Supabase', () => {
  assert.match(api, /pos_venta_crear_auth/);
  assert.match(api, /p_payload: payload/);
  assert.match(page, /clienteId: clienteIdVenta/);
  assert.match(page, /clienteServidor/);
});

test('la RPC solo se considera exitosa con comprobante, serie y correlativo', () => {
  assert.match(api, /result\.ok !== true/);
  assert.match(api, /result\.comprobanteId/);
  assert.match(api, /result\.serie/);
  assert.match(api, /result\.correlativo/);
});

test('reintento reutiliza clave estable y evita duplicar ticket local', () => {
  assert.match(api, /obtenerClaveVentaSupabase/);
  assert.match(api, /limpiarClaveVentaSupabase/);
  assert.match(page, /db\.ventas\.where\('idempotencyKey'\)\.equals\(idempotencyKey\)\.first\(\)/);
});

test('protege doble envío y no usa fallback heredado para Supabase', () => {
  assert.match(page, /if \(cobroEnCurso\.current\) return/);
  assert.match(api, /Nunca deriva a NestJS ni a una cola offline/);
  assert.match(edge, /SUPABASE_RPC_ALLOWLIST/);
});

test('documenta explícitamente condiciones previas y límites de activación', () => {
  assert.match(docs, /mantener `false` hasta pasar todas las validaciones/);
  assert.match(docs, /Consumidor Final `00000000`/);
  assert.match(docs, /nota de venta/);
});
