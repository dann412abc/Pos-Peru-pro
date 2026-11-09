import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('./202611090011_inventory_count_stock_lock.sql', import.meta.url), 'utf8');

test('physical count lock migration is preview-only and checks prerequisites', () => {
  assert.match(migration, /PREVIEW ONLY/);
  assert.match(migration, /INVENTORY_COUNT_LOCK_PREREQUISITES_MISSING/);
  assert.match(migration, /INVENTORY_COUNT_LOCK_SCHEMA_INCOMPATIBLE/);
});

test('stock writes for base products and variants share a company-branch transaction lock', () => {
  assert.match(migration, /pos:inventory-count:/);
  assert.match(migration, /trg_inventario_conteo_bloquear_producto_stock/);
  assert.match(migration, /trg_inventario_conteo_bloquear_variante_stock/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF stock OR DELETE/);
  assert.match(migration, /INVENTORY_COUNT_OPEN/);
});

test('count opening serializes snapshot creation against stock writes', () => {
  assert.match(migration, /trg_inventario_conteo_serializar_apertura/);
  assert.match(migration, /BEFORE INSERT ON public\.inventario_conteo/);
});

test('count close uses a transaction-local count-specific bypass and same branch lock', () => {
  assert.match(migration, /pos\.inventory_count_close_id/);
  assert.match(migration, /set_config\('pos\.inventory_count_close_id',p_conteo_id::text,true\)/);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*pos:inventory-count:/);
  assert.match(migration, /INVENTORY_COUNT_LINES_PENDING/);
  assert.match(migration, /pos_inventario_ajustar_lote_auth/);
  assert.match(migration, /set_config\('pos\.inventory_count_close_id','',true\)/);
});

test('close still requires authenticated ADMIN and grants only authenticated execution', () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /mi_rol\(\) IS DISTINCT FROM 'ADMIN'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.pos_inventario_conteo_cerrar_auth\(bigint\) FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.pos_inventario_conteo_cerrar_auth\(bigint\) TO authenticated/);
});
