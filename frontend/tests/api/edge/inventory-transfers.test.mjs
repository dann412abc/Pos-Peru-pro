import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const edge = fs.readFileSync(path.join(root, 'frontend/functions/api/edge/[[path]].js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'frontend/src/api/supabaseInventory.ts'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations-preview/202611090008_inventory_transfers_auth.sql'), 'utf8');

test('Edge transfer route requires Bearer auth and validates branch/line payload', () => {
  assert.match(edge, /route === 'inventory\/transfers'/);
  assert.match(edge, /INVENTORY_TRANSFER_FORBIDDEN/);
  assert.match(edge, /INVENTORY_TRANSFER_MIGRATION_REQUIRED/);
  assert.match(edge, /sucursalOrigenId === p\.sucursalDestinoId/);
  assert.match(edge, /DUPLICATE|new Set\(p\.lineas\.map/);
});

test('frontend client rejects demo sessions and malformed transfer lines', () => {
  assert.match(client, /transferirInventarioSupabase/);
  assert.match(client, /Inicia sesión con Supabase/);
  assert.match(client, /idempotencyKey/);
  assert.match(client, /trazabilidadLotes/);
  assert.match(client, /incluyeVariantes/);
});

test('SQL transfer is transactional, idempotent and restricted to authenticated users', () => {
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /INVENTORY_TRANSFER_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_inventario_transferir_auth\(jsonb\) TO authenticated/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_inventario_transferir_auth\(jsonb\) FROM PUBLIC,anon/);
});

test('SQL transfers exact product/variant lots in FEFO order and records paired movements', () => {
  assert.match(sql, /ORDER BY fecha_vencimiento ASC NULLS LAST,created_at ASC,id ASC FOR UPDATE/);
  assert.match(sql, /variante_id IS NOT DISTINCT FROM v_variante/);
  assert.match(sql, /INSERT INTO public\.movimiento_inventario/);
  assert.match(sql, /trazabilidadLotes',true/);
  assert.match(sql, /incluyeVariantes',true/);
});
