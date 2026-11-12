import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const edge = fs.readFileSync(path.join(root, 'frontend/functions/api/edge/[[path]].js'), 'utf8');

test('Edge translates the physical-count stock lock into a clear conflict for the operator', () => {
  assert.match(edge, /async function stockMovementRpcResponse\(response, bodyText\)/);
  assert.match(edge, /detail\.includes\('INVENTORY_COUNT_OPEN'\)/);
  assert.match(edge, /error: 'INVENTORY_COUNT_OPEN'/);
  assert.match(edge, /Hay un inventario físico abierto en esta sucursal/);
  assert.match(edge, /\}, 409\)/);
});

test('all Supabase stock-writing routes share the physical-count conflict translation', () => {
  const requiredRpcs = [
    'pos_inventario_transferir_auth',
    'pos_inventario_ajustar_lote_auth',
    'pos_compra_recibir_auth',
    'pos_registrar_venta_fefo_auth',
    'pos_devolucion_registrar_auth',
    'pos_inventario_merma_registrar_auth',
  ];
  for (const rpc of requiredRpcs) {
    const rpcIndex = edge.indexOf(rpc);
    assert.notEqual(rpcIndex, -1, `missing RPC route: ${rpc}`);
    const nextTry = edge.indexOf('} catch', rpcIndex);
    const segment = edge.slice(rpcIndex, nextTry === -1 ? rpcIndex + 5000 : nextTry);
    assert.match(segment, /stockMovementRpcResponse\(response, result\)/, `route does not translate count lock: ${rpc}`);
  }
});

test('translation preserves ordinary PostgREST errors and their HTTP status', () => {
  const start = edge.indexOf('async function stockMovementRpcResponse');
  const end = edge.indexOf('function validSupabaseConfig', start);
  const helper = edge.slice(start, end);
  assert.match(helper, /status: response\.status/);
  assert.match(helper, /bodyText/);
  assert.match(helper, /content-type/);
});
