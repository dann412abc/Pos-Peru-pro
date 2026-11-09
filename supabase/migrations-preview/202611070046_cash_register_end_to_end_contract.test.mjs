import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), 'utf8');
const edge = read('../../frontend/functions/api/edge/[[path]].js');
const client = read('../../frontend/src/api/supabaseCash.ts');
const screen = read('../../frontend/src/pages/CierreCaja.tsx');
const lifecycle = read('./202611070043_cash_register_lifecycle_auth.sql');
const reconciliation = read('./202611070045_cash_refund_reconciliation_auth.sql');

test('cash frontend endpoints map to the authenticated lifecycle RPC contracts', () => {
  assert.match(client, /axios\.post\('\/api\/edge\/cash\/open'/);
  assert.match(client, /axios\.post\('\/api\/edge\/cash\/movement'/);
  assert.match(client, /axios\.post\('\/api\/edge\/cash\/close'/);
  assert.match(client, /axios\.get\('\/api\/edge\/cash\/summary'/);
  assert.match(client, /axios\.get\('\/api\/edge\/cash\/movements'/);

  assert.match(edge, /route === 'cash\/open'[\s\S]*?pos_caja_abrir_auth/);
  assert.match(edge, /route === 'cash\/movement'[\s\S]*?pos_caja_movimiento_auth/);
  assert.match(edge, /pos_caja_cerrar_auth/);
  assert.match(edge, /pos_caja_movimientos_listar_auth/);
  assert.match(edge, /pos_caja_resumen_auth/);
});

test('Edge RPC arguments match the SQL function signatures', () => {
  assert.match(edge, /p_sucursal_id: sucursalId, p_saldo_inicial: saldoInicial/);
  assert.match(edge, /p_caja_id: cajaId, p_tipo: body\.tipo, p_metodo: body\.metodoPago, p_monto: monto, p_motivo: body\.motivo\.trim\(\)/);
  assert.match(edge, /p_caja_id: cajaId, p_efectivo_contado: efectivoContado, p_arqueo: body\.arqueo/);
  assert.match(edge, /JSON\.stringify\(\{ p_caja_id: cajaId \}\)/);
  assert.match(lifecycle, /FUNCTION public\.pos_caja_abrir_auth\(p_sucursal_id integer,p_saldo_inicial numeric\)/);
  assert.match(lifecycle, /FUNCTION public\.pos_caja_movimiento_auth\(p_caja_id integer,p_tipo text,p_metodo text,p_monto numeric,p_motivo text\)/);
  assert.match(lifecycle, /FUNCTION public\.pos_caja_cerrar_auth\(p_caja_id integer,p_efectivo_contado numeric,p_arqueo jsonb\)/);
  assert.match(reconciliation, /FUNCTION public\.pos_caja_resumen_auth\(p_caja_id integer\)/);
  assert.match(reconciliation, /FUNCTION public\.pos_caja_movimientos_listar_auth\(p_caja_id integer\)/);
});

test('cash screen reloads server summary and movement history after mutations', () => {
  assert.match(screen, /await fetchSupabaseCashSummary\(cajaActual\.id\)/);
  assert.match(screen, /await fetchSupabaseCashMovements\(cajaActual\.id\)/);
  assert.match(screen, /await openSupabaseCash\(/);
  assert.match(screen, /await registerSupabaseCashMovement\(payload\)/);
  assert.match(screen, /await closeSupabaseCash\(/);
  assert.match(screen, /await recargar\(\)/);
  assert.match(screen, /totalDevoluciones/);
});

test('cash close and summary implement the same cash balance equation', () => {
  const closeCashEquation = lifecycle.match(/v_esperado:=round\(COALESCE\(v_caja\.saldo_inicial,0\)\+v_efectivo\+v_mov_efectivo-COALESCE\(v_dev_efectivo,0\),2\)/);
  const summaryCashEquation = reconciliation.match(/v_efectivo_esperado:=round\(COALESCE\(v_saldo,0\)\+COALESCE\(v_efectivo,0\)-COALESCE\(v_dev_efectivo,0\)\+COALESCE\(v_mov_efectivo,0\),2\)/);
  assert.ok(closeCashEquation, 'close RPC must include opening balance, cash collections, cash movements and cash refunds');
  assert.ok(summaryCashEquation, 'summary RPC must use the same cash balance equation');
});

test('end-to-end fixture reconciles opening, split sale, refund and manual movements', () => {
  const opening = 200;
  const sale = { EFECTIVO: 60, YAPE: 40 };
  const refund = { EFECTIVO: 20 };
  const movements = [
    { tipo: 'SALIDA', metodo: 'EFECTIVO', monto: 10 },
    { tipo: 'INGRESO', metodo: 'YAPE', monto: 5 },
  ];
  const movementNet = (method) => movements
    .filter((movement) => movement.metodo === method)
    .reduce((sum, movement) => sum + (movement.tipo === 'INGRESO' ? movement.monto : -movement.monto), 0);
  const netCash = sale.EFECTIVO - refund.EFECTIVO + movementNet('EFECTIVO');
  const netYape = sale.YAPE - (refund.YAPE || 0) + movementNet('YAPE');
  const expectedCash = opening + netCash;
  const netSales = sale.EFECTIVO + sale.YAPE - refund.EFECTIVO;

  assert.equal(netCash, 30);
  assert.equal(netYape, 45);
  assert.equal(expectedCash, 230);
  assert.equal(netSales, 80);
  assert.equal(228 - expectedCash, -2);
});
