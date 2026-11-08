import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('./202611070013_purchase_cancel_rpc.sql', import.meta.url), 'utf8');
test('RPC de anulación deriva empresa y usuario desde auth.uid()', () => {
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /supabase_auth_user_id=v_auth/);
});
test('RPC impide anular compras con pagos o devoluciones', () => {
  assert.match(sql, /compra_pago/);
  assert.match(sql, /devolucion_proveedor/);
});
test('RPC requiere lotes intactos y stock/costo sin cambios posteriores', () => {
  assert.match(sql, /cantidad_disponible=il\.cantidad_inicial/);
  assert.match(sql, /stock_posterior/);
  assert.match(sql, /costo_promedio_posterior/);
});
test('RPC revierte inventario y deja auditoría sin borrar movimientos', () => {
  assert.match(sql, /movimiento_inventario/);
  assert.match(sql, /estado='ANULADA'/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.(compra|compra_linea|movimiento_inventario)/i);
});
