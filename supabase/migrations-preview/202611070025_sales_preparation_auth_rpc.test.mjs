import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations-preview/202611070025_sales_preparation_auth_rpc.sql','utf8');

test('la RPC de preparación integra contexto autenticado e idempotencia antes del catálogo', () => {
  const rpc = sql.indexOf('CREATE OR REPLACE FUNCTION public.pos_venta_preparar_auth');
  const body = sql.slice(rpc);
  const context = body.indexOf('pos_venta_contexto_auth(p_payload)');
  const idem = body.indexOf('pos_venta_idempotencia_resolver_interna(');
  const catalog = body.indexOf('pos_venta_validar_cliente_catalogo_interno(');
  assert.ok(rpc >= 0 && context >= 0 && idem > context && catalog > idem);
});

test('valida cliente dentro de la empresa y bloquea su fila', () => {
  assert.match(sql, /cl\.id\s*=\s*p_cliente_id/i);
  assert.match(sql, /cl\.empresa_id\s*=\s*p_empresa_id/i);
  assert.match(sql, /FOR SHARE/i);
});

test('valida productos base y variantes contra empresa, sucursal y estado', () => {
  assert.match(sql, /p\.empresa_id\s*=\s*p_empresa_id/i);
  assert.match(sql, /v_producto\.activo\s+IS DISTINCT FROM TRUE/i);
  assert.match(sql, /pv\.producto_id\s*=\s*v_item\.producto_id/i);
  assert.match(sql, /v_variante\.activo\s+IS DISTINCT FROM TRUE/i);
  assert.match(sql, /vs\.sucursal_id\s*=\s*p_sucursal_id/i);
  assert.match(sql, /ps\.sucursal_id\s*=\s*p_sucursal_id/i);
});

test('no confía en precio del navegador y revisa existencias con locks', () => {
  assert.match(sql, /precioCatalogo/);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /INSUFFICIENT_STOCK/);
  assert.match(sql, /INSUFFICIENT_VARIANT_STOCK/);
  assert.match(sql, /stockReserved', false/i);
});

test('no escribe comprobantes, pagos, movimientos ni modifica stock', () => {
  assert.match(sql, /saleCreated', false/i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+public\.(comprobante|comprobante_linea|comprobante_pago|movimiento_inventario|caja_movimiento)|\bUPDATE\s+public\.(producto_stock|producto_variante_stock|inventario_lote|serie_correlativo)\b/i);
});

test('solo la RPC de preparación es ejecutable por authenticated', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_venta_validar_cliente_catalogo_interno.*FROM authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_venta_preparar_auth\(jsonb\) TO authenticated/i);
});
