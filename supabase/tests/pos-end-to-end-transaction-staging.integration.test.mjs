import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = process.env.POS_E2E_FIXTURE;
const enabled = process.env.POS_E2E_STAGING_CONFIRM === 'YES' && Boolean(fixturePath);
const require = createRequire(resolve(here, '../../backend/package.json'));
let Client;
let fixture;
if (enabled) {
  ({ Client } = require('pg'));
  fixture = JSON.parse(readFileSync(resolve(process.cwd(), fixturePath), 'utf8'));
}

function config() {
  for (const key of ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
    if (!process.env[key]) throw new Error(`Missing ${key}; end-to-end staging requires an explicit DB connection.`);
  }
  if (process.env.PGHOST.includes('pooler.supabase.com') && !process.env.PGPORT) {
    throw new Error('Set PGPORT explicitly for the Supabase pooler.');
  }
  return {
    host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000, application_name: 'controla-ventas-e2e-staging'
  };
}

async function begin(client, authUserId) {
  await client.query('BEGIN');
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [authUserId]);
  await client.query("SELECT set_config('request.jwt.claims',json_build_object('sub',$1,'role','authenticated')::text,true)", [authUserId]);
  await client.query('SET LOCAL ROLE authenticated');
}
async function privileged(client) { await client.query('RESET ROLE'); }
async function authenticated(client) { await client.query('SET LOCAL ROLE authenticated'); }

async function snapshot(client, spec) {
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.compra WHERE empresa_id=$1) AS purchases,
      (SELECT count(*)::int FROM public.comprobante WHERE empresa_id=$1) AS sales,
      (SELECT count(*)::int FROM public.devolucion_venta WHERE empresa_id=$1) AS returns,
      (SELECT count(*)::int FROM public.caja_movimiento cm JOIN public.caja ca ON ca.id=cm.caja_id
        WHERE ca.sucursal_id=$2) AS cash_movements,
      (SELECT count(*)::int FROM public.movimiento_inventario WHERE empresa_id=$1) AS inventory_movements
  `, [spec.empresaId, spec.sucursalId]);
  const stockQuery = spec.stock.variantId
    ? ['SELECT stock FROM public.producto_variante_stock WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4',
       [spec.empresaId, spec.sucursalId, spec.stock.productId, spec.stock.variantId]]
    : ['SELECT stock FROM public.producto_stock WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3',
       [spec.empresaId, spec.sucursalId, spec.stock.productId]];
  const stock = await client.query(stockQuery[0], stockQuery[1]);
  assert.equal(stock.rowCount, 1, 'stock fixture row must exist');
  const lots = await client.query(
    'SELECT id,codigo_lote,cantidad_disponible FROM public.inventario_lote WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id IS NOT DISTINCT FROM $4 ORDER BY id',
    [spec.empresaId, spec.sucursalId, spec.stock.productId, spec.stock.variantId ?? null]
  );
  return {
    counts: counts.rows[0], stock: Number(stock.rows[0].stock),
    lots: lots.rows.map(x => ({ id: Number(x.id), code: x.codigo_lote, available: Number(x.cantidad_disponible) }))
  };
}

test('flujo transaccional compra → venta → caja → devolución → inventario', { skip: !enabled }, async () => {
  assert.ok(fixture.authUserId, 'authUserId is required');
  const s = fixture.scenario;
  assert.ok(s?.empresaId && s?.sucursalId && s?.stock?.productId, 'scenario tenant, branch and stock are required');
  assert.ok(s.purchasePayload && s.salePayload && s.returnAfterSale, 'purchasePayload, salePayload and returnAfterSale are required');
  assert.ok(s.returnAfterSale.quantity > 0, 'returnAfterSale.quantity must be positive');
  const client = new Client(config());
  await client.connect();
  try {
    await begin(client, fixture.authUserId);
    await privileged(client);
    const before = await snapshot(client, s);

    await authenticated(client);
    const purchase = (await client.query(
      'SELECT public.pos_compra_recibir_auth($1::jsonb) AS result', [JSON.stringify(s.purchasePayload)]
    )).rows[0].result;
    assert.equal(purchase.ok, true, JSON.stringify(purchase));
    assert.ok(purchase.compraId);

    await authenticated(client);
    const sale = (await client.query(
      'SELECT public.pos_registrar_venta_fefo_auth($1::jsonb) AS result', [JSON.stringify(s.salePayload)]
    )).rows[0].result;
    assert.equal(sale.ok, true, JSON.stringify(sale));
    assert.ok(sale.comprobanteId);

    await privileged(client);
    const line = await client.query(
      `SELECT id,cantidad,subtotal,descuento FROM public.comprobante_linea
       WHERE comprobante_id=$1 AND producto_id=$2 AND variante_id IS NOT DISTINCT FROM $3
       ORDER BY id LIMIT 1`,
      [sale.comprobanteId, s.stock.productId, s.stock.variantId ?? null]
    );
    assert.equal(line.rowCount, 1, 'sale must contain the purchased product/variant');
    const original = line.rows[0];
    const quantity = Number(s.returnAfterSale.quantity);
    assert.ok(quantity <= Number(original.cantidad), 'return quantity cannot exceed sold quantity');
    const lineAmount = Number(original.subtotal) - Number(original.descuento || 0);
    const refundAmount = Math.abs(quantity - Number(original.cantidad)) < 0.0001
      ? Number(lineAmount.toFixed(2))
      : Number((lineAmount * quantity / Number(original.cantidad)).toFixed(2));
    const returnPayload = {
      motivo: s.returnAfterSale.reason || 'Prueba integral de devolución staging',
      idempotencyKey: s.returnAfterSale.idempotencyKey,
      lineas: [{ comprobanteLineaId: Number(original.id), cantidad: quantity, reingresarStock: true }],
      pagos: [{ metodoPago: s.returnAfterSale.method, monto: refundAmount,
        ...(s.returnAfterSale.reference ? { referencia: s.returnAfterSale.reference } : {}) }]
    };
    assert.ok(returnPayload.idempotencyKey, 'return idempotencyKey is required');
    await authenticated(client);
    const returned = (await client.query(
      'SELECT public.pos_devolucion_registrar_auth($1::integer,$2::jsonb) AS result',
      [sale.comprobanteId, JSON.stringify(returnPayload)]
    )).rows[0].result;
    assert.ok(returned.id, JSON.stringify(returned));
    assert.equal(returned.reintento, false);
    assert.equal(returned.trazabilidadRepetida, false);

    await privileged(client);
    const returnLines = await client.query(
      `SELECT il.codigo_lote,dvl.cantidad FROM public.devolucion_venta_lote dvl
       JOIN public.inventario_lote il ON il.id=dvl.lote_id
       JOIN public.devolucion_venta_linea dl ON dl.id=dvl.devolucion_linea_id
       WHERE dl.devolucion_id=$1 ORDER BY dvl.id`, [returned.id]
    );
    assert.ok(returnLines.rowCount > 0, 'return must restore original FEFO lot trace');
    const restored = returnLines.rows.reduce((sum, row) => sum + Number(row.cantidad), 0);
    assert.ok(Math.abs(restored - quantity) < 0.001, 'restored lot quantity must equal returned quantity');
    const after = await snapshot(client, s);
    assert.equal(after.counts.purchases - before.counts.purchases, 1);
    assert.equal(after.counts.sales - before.counts.sales, 1);
    assert.equal(after.counts.returns - before.counts.returns, 1);
    assert.ok(after.counts.cash_movements > before.counts.cash_movements, 'sale and refund must write cash ledger movements');
    assert.ok(after.counts.inventory_movements > before.counts.inventory_movements, 'purchase and sale must write inventory movements');
    assert.ok(after.stock >= before.stock, 'return must restore stock after sale');
    if (s.expected?.finalStock !== undefined) {
      assert.ok(Math.abs(after.stock - Number(s.expected.finalStock)) < 0.001, 'final stock must match fixture');
    }
    if (s.expected?.restoredLotCode) {
      assert.ok(returnLines.rows.some(row => row.codigo_lote === s.expected.restoredLotCode),
        'return must restore the lot consumed by FEFO sale');
    }

    await authenticated(client);
    const replay = (await client.query(
      'SELECT public.pos_devolucion_registrar_auth($1::integer,$2::jsonb) AS result',
      [sale.comprobanteId, JSON.stringify(returnPayload)]
    )).rows[0].result;
    assert.equal(Number(replay.id), Number(returned.id));
    assert.equal(replay.reintento, true);
    assert.equal(replay.trazabilidadRepetida, true);
    await privileged(client);
    const afterReplay = await snapshot(client, s);
    assert.deepEqual(afterReplay, after, 'return replay must not duplicate stock, lot, cash or inventory effects');
  } finally {
    try { await client.query('ROLLBACK'); } catch {}
    await client.end();
  }
});

test('sin confirmación explícita y fixture el runner no se conecta a la base', { skip: enabled }, () => {
  assert.equal(enabled, false);
});
