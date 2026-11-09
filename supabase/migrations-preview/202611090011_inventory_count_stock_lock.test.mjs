import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('./202611090011_inventory_count_stock_lock.sql', import.meta.url), 'utf8');

test('physical count lock migration is preview-only and checks prerequisites', () => {
  assert.ok(migration.includes('PREVIEW ONLY'));
  assert.ok(migration.includes('INVENTORY_COUNT_LOCK_PREREQUISITES_MISSING'));
  assert.ok(migration.includes('INVENTORY_COUNT_LOCK_SCHEMA_INCOMPATIBLE'));
});

test('base and variant stock writes are rejected while a physical count is open', () => {
  assert.ok(migration.includes('trg_inventario_conteo_bloquear_producto_stock'));
  assert.ok(migration.includes('trg_inventario_conteo_bloquear_variante_stock'));
  assert.ok(migration.includes('BEFORE INSERT OR UPDATE OF stock OR DELETE'));
  assert.ok(migration.includes('INVENTORY_COUNT_OPEN'));
  assert.ok(migration.includes('c.estado=\'ABIERTO\''));
});

test('opening serializes the stock snapshot against concurrent writers', () => {
  assert.ok(migration.includes('LOCK TABLE public.producto_stock,public.producto_variante_stock IN SHARE ROW EXCLUSIVE MODE'));
  assert.ok(migration.includes('trg_inventario_conteo_serializar_apertura'));
  assert.ok(migration.includes('BEFORE INSERT ON public.inventario_conteo'));
});

test('close bypass is transaction-local and bound to the exact open count', () => {
  assert.ok(migration.includes('pos.inventory_count_close_id'));
  assert.ok(migration.includes("set_config('pos.inventory_count_close_id',p_conteo_id::text,true)"));
  assert.ok(migration.includes('c.id::text=v_close_id'));
  assert.ok(migration.includes('pos_inventario_ajustar_lote_auth'));
  assert.ok(migration.includes("set_config('pos.inventory_count_close_id','',true)"));
});

test('close remains authenticated ADMIN-only', () => {
  assert.ok(migration.includes('auth.uid()'));
  assert.ok(migration.includes("public.mi_rol() IS DISTINCT FROM 'ADMIN'"));
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.pos_inventario_conteo_cerrar_auth(bigint) FROM PUBLIC,anon'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.pos_inventario_conteo_cerrar_auth(bigint) TO authenticated'));
});
