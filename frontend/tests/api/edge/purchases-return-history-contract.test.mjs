import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../../../../supabase/migrations-preview/202611070009_purchases_read_rpc.sql', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../../../src/pages/Compras.tsx', import.meta.url), 'utf8');

test('el detalle Supabase devuelve devoluciones reales al proveedor', () => {
  assert.match(sql, /'devoluciones',\s*COALESCE\(\(SELECT jsonb_agg/);
  assert.match(sql, /'aplicadoCuenta',d\.aplicado_cuenta/);
  assert.match(sql, /'saldoAFavor',d\.saldo_a_favor/);
  assert.match(sql, /FROM public\.devolucion_proveedor d[\s\S]*WHERE d\.compra_id=c\.id AND d\.empresa_id=v_empresa/);
});

test('la pantalla muestra el historial de devoluciones recibido por la RPC', () => {
  assert.match(page, /\(detalle\.devoluciones\s*\|\|\s*\[\]\)\.length/);
  assert.match(page, /detalle\.devoluciones\.map/);
});
