import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, relative), 'utf8');
const purchaseSql = read('./202611090005_purchase_receive_auth.sql');
const saleSql = read('./202611090006_sales_fefo_auth.sql');
const edge = read('../../frontend/functions/api/edge/[[path]].js');
const purchasesApi = read('../../frontend/src/api/supabasePurchases.ts');
const salesApi = read('../../frontend/src/api/supabaseSales.ts');
const purchaseUi = read('../../frontend/src/pages/Compras.tsx');
const salesUi = read('../../frontend/src/pages/VentaRapida.tsx');

test('purchase receipt and sale FEFO share product, variant, branch and lot identity', () => {
  assert.match(purchaseSql, /INSERT INTO public\.inventario_lote\(empresa_id,sucursal_id,producto_id,variante_id,compra_id,compra_linea_id,codigo_lote/);
  assert.match(saleSql, /il\.empresa_id=v_empresa[\s\S]*?il\.sucursal_id=v_sucursal[\s\S]*?il\.producto_id=v_line\.producto_id[\s\S]*?il\.variante_id IS NOT DISTINCT FROM v_line\.variante_id/);
  assert.match(saleSql, /UPDATE public\.inventario_lote[\s\S]*?SET cantidad_disponible=cantidad_disponible-v_tomar/);
  assert.match(saleSql, /INSERT INTO public\.comprobante_lote_salida\([\s\S]*?comprobante_linea_id,lote_id,producto_id,variante_id,cantidad/);
});

test('FEFO sale allocation excludes expired lots and consumes earliest expiry first', () => {
  assert.match(saleSql, /il\.fecha_vencimiento IS NULL[\s\S]*?il\.fecha_vencimiento >= \(now\(\) AT TIME ZONE 'America\/Lima'\)::date/);
  assert.match(saleSql, /ORDER BY il\.fecha_vencimiento ASC NULLS LAST,il\.created_at ASC,il\.id ASC[\s\S]*?FOR UPDATE/);
  assert.match(saleSql, /SALE_FEFO_STOCK_MISMATCH/);
  assert.match(saleSql, /SALE_FEFO_LOT_RACE/);
});

test('purchase and sale frontend services call their matching authenticated Edge routes', () => {
  assert.match(purchasesApi, /axios\.post\('\/api\/edge\/purchases\/receive', \{ payload \}/);
  assert.match(salesApi, /axios\.post\('\/api\/edge\/sales\/register', \{ payload \}/);
  assert.match(edge, /route === 'purchases\/receive'[\s\S]*?pos_compra_recibir_auth/);
  assert.match(edge, /route === 'sales\/register'[\s\S]*?pos_registrar_venta_fefo_auth/);
});

test('purchase UI supports mixed supplier payments and validates the exact total', () => {
  assert.match(purchaseUi, /pagosCompra\.map\(\(pago\)/);
  assert.match(purchaseUi, /pagosCompra\.reduce\(\(sum, p\) => sum \+ Math\.max\(0, Number\(p\.monto\) \|\| 0\), 0\)/);
  assert.match(purchaseUi, /metodoPago: pago\.metodoPago/);
  assert.match(purchaseUi, /pago\.metodoPago !== 'TRANSFERENCIA' \? \{ cajaId: cajas\[0\]\?\.id \}/);
  assert.match(purchaseUi, /Añadir medio/);
  assert.match(purchaseUi, /Completar saldo en último medio/);
  assert.match(purchaseSql, /cardinality\(cash_ids\)>1 THEN RAISE EXCEPTION 'PURCHASE_MULTIPLE_CASHBOXES'/);
});

test('purchase UI submits variant, pack conversion, lot and expiry fields', () => {
  assert.match(purchaseUi, /varianteId: l\.varianteId/);
  assert.match(purchaseUi, /unidadesPorEmpaque: Number\(l\.unidadesPorEmpaque\)/);
  assert.match(purchaseUi, /codigoLote:l\.codigoLote\.trim\(\)/);
  assert.match(purchaseUi, /fechaVencimiento:l\.fechaVencimiento/);
  assert.match(purchaseUi, /await recibirCompraSupabase\(payload as any\)/);
});

test('sale UI submits the exact selected variant and quantity to the FEFO sale payload', () => {
  assert.match(salesUi, /varianteId: l\.varianteId \? Number\(l\.varianteId\) : null/);
  assert.match(salesUi, /cantidad: Number\(l\.cantidad\)/);
  assert.match(salesUi, /await crearVentaSupabase\(payloadSupabase\)/);
  assert.match(salesApi, /trazabilidadFEFO !== true/);
});

test('sale FEFO replay and recovery use the exact writer fingerprint', () => {
  const fingerprint = /md5\(p_(?:venta|payload)::text\)/g;
  assert.equal((saleSql.match(fingerprint) || []).length, 2);
  assert.match(saleSql, /v_hash:=md5\(p_venta::text\)/);
  assert.match(saleSql, /v_hash:=md5\(p_payload::text\)/);
  assert.doesNotMatch(saleSql, /encode\(sha256\(convert_to/);
  assert.match(saleSql, /SALE_IDEMPOTENCY_CONFLICT/);
  assert.match(saleSql, /request_hash IS DISTINCT FROM v_hash/);
});

test('sales mixed payments require unique methods and exact server-side total', () => {
  const validator = read('../migrations-preview/202611070028_sales_payment_validation.sql');
  const writer = read('../migrations-preview/202611070033_sales_document_payment_writer_internal.sql');
  assert.match(validator, /v_count < 1 OR v_count > 5/);
  assert.match(validator, /SALE_PAYMENT_METHOD_DUPLICATED/);
  assert.match(validator, /IF v_suma <> v_total/);
  assert.match(validator, /SALE_CREDIT_LIMIT_EXCEEDED/);
  assert.match(writer, /INSERT INTO public\.comprobante_pago/);
  assert.match(writer, /v_payment_count <> jsonb_array_length/);
});

test('purchase weighted average safely handles legacy null cost and computes both base and variant costs', () => {
  assert.match(purchaseSql, /avg_after:=round\(\(\(stock_before\*COALESCE\(avg_before,0\)\)\+\(qty\*unit_cost\)\)\/\(stock_before\+qty\),4\)/);
  assert.match(purchaseSql, /UPDATE public\.producto_stock SET stock=stock_after,costo_promedio=avg_after/);
  assert.match(purchaseSql, /UPDATE public\.producto_variante_stock SET stock=stock_after,costo_promedio=avg_after/);
  const weighted = (stock, average, incoming, cost) => Number((((stock * (average ?? 0)) + incoming * cost) / (stock + incoming)).toFixed(4));
  assert.equal(weighted(10, 5, 5, 8), 6);
  assert.equal(weighted(0, null, 5, 8), 8);
});

test('FEFO fixture consumes only the selected variant lots in earliest-expiry order', () => {
  const today = '2026-11-09';
  const lots = [
    { id: 1, variant: 71, expiry: '2026-11-20', available: 3 },
    { id: 2, variant: 72, expiry: '2026-11-12', available: 9 },
    { id: 3, variant: 71, expiry: '2026-11-12', available: 2 },
    { id: 4, variant: 71, expiry: '2026-11-08', available: 10 },
    { id: 5, variant: 71, expiry: '2026-12-01', available: 5 },
  ];
  let pending = 4;
  const consumed = [];
  for (const lot of lots
    .filter((item) => item.variant === 71 && item.available > 0 && item.expiry >= today)
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.id - b.id)) {
    if (pending <= 0) break;
    const quantity = Math.min(pending, lot.available);
    consumed.push({ id: lot.id, quantity });
    pending -= quantity;
  }
  assert.equal(pending, 0);
  assert.deepEqual(consumed, [{ id: 3, quantity: 2 }, { id: 1, quantity: 2 }]);
});

const returnSql = read('./202611090003_returns_register_fefo_auth.sql');
const returnWriter = read('./202611090012_returns_transactional_writer_auth.sql');
const cashSql = read('./202611070045_cash_refund_reconciliation_auth.sql');
const returnsApi = read('../../frontend/src/api/supabaseReturns.ts');

test('purchase → FEFO sale → return uses the same original receipt-line and lot trace', () => {
  assert.match(purchaseSql, /INSERT INTO public\.inventario_lote/);
  assert.match(saleSql, /INSERT INTO public\.comprobante_lote_salida/);
  assert.match(returnSql, /FROM public\.comprobante_lote_salida cls[\s\S]*?cls\.comprobante_linea_id=v_linea_id/);
  assert.match(returnSql, /INSERT INTO public\.devolucion_venta_lote\(devolucion_linea_id,lote_id,cantidad\)/);
  assert.match(returnSql, /UPDATE public\.inventario_lote[\s\S]*?SET cantidad_disponible=cantidad_disponible\+v_tomar/);
  assert.match(returnSql, /La trazabilidad original no cubre la cantidad a devolver/);
  assert.match(returnSql, /v_result->>'reintento'/);
});

test('return registration is wired from the authenticated frontend to the FEFO Edge RPC', () => {
  assert.match(returnsApi, /axios\.post\('\/api\/edge\/returns\/register'/);
  assert.match(edge, /route === 'returns\/register'[\s\S]*?pos_devolucion_registrar_auth/);
  assert.match(edge, /p_comprobante_id:\s*comprobanteId/);
  assert.match(returnSql, /FUNCTION public\.pos_devolucion_registrar_auth\(integer,jsonb\)/);
  assert.match(returnWriter, /pg_advisory_xact_lock/);
  assert.match(returnWriter, /v_existente\.request_hash IS DISTINCT FROM v_hash/);
  assert.match(returnWriter, /v_existente\.request_hash IS DISTINCT FROM v_hash_legacy/);
});

test('refund is reconciled once in cash close and history, without counting its cash ledger twice', () => {
  assert.match(returnWriter, /devolucion_venta_id/);
  assert.match(returnWriter, /'SALIDA'/);
  assert.match(cashSql, /devolucion_venta_id IS NULL/);
  assert.match(cashSql, /FROM public\.devolucion_venta_pago dp[\s\S]*?'Reembolso devolución #'/);
  assert.match(cashSql, /v_efectivo_esperado:=round\([\s\S]*?v_dev_efectivo/);
});

test('reference lot allocation restores only the quantities originally consumed', () => {
  const originalAllocations = [
    { lot: 'LOT-A', sold: 2, returnedBefore: 0 },
    { lot: 'LOT-B', sold: 3, returnedBefore: 1 },
  ];
  let remainingReturn = 3;
  const restored = [];
  for (const allocation of originalAllocations) {
    const availableToReturn = allocation.sold - allocation.returnedBefore;
    const quantity = Math.min(remainingReturn, availableToReturn);
    if (quantity > 0) restored.push({ lot: allocation.lot, quantity });
    remainingReturn -= quantity;
    if (remainingReturn <= 0) break;
  }
  assert.equal(remainingReturn, 0);
  assert.deepEqual(restored, [{ lot: 'LOT-A', quantity: 2 }, { lot: 'LOT-B', quantity: 1 }]);
  assert.equal(restored.reduce((sum, item) => sum + item.quantity, 0), 3);
});
