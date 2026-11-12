import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = process.env.POS_RETURNS_FIXTURE;
const enabled = process.env.POS_RETURNS_STAGING_CONFIRM === 'YES' && Boolean(fixturePath);
const require = createRequire(resolve(here, '../../backend/package.json'));
let Client;
let fixture;

if (enabled) {
  ({ Client } = require('pg'));
  fixture = JSON.parse(readFileSync(resolve(process.cwd(), fixturePath), 'utf8'));
}

function connectionConfig() {
  for (const key of ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
    if (!process.env[key]) throw new Error(`Missing ${key}; returns staging requires an explicit DB connection.`);
  }
  if (process.env.PGHOST.includes('pooler.supabase.com') && !process.env.PGPORT) {
    throw new Error('Set PGPORT explicitly for the Supabase pooler.');
  }
  return {
    host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000, application_name: 'controla-ventas-returns-staging-tests'
  };
}

async function beginAsAuthenticated(client, authUserId) {
  await client.query('BEGIN');
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [authUserId]);
  await client.query("SELECT set_config('request.jwt.claims',json_build_object('sub',$1,'role','authenticated')::text,true)", [authUserId]);
  await client.query('SET LOCAL ROLE authenticated');
}

async function snapshot(client, spec) {
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.devolucion_venta WHERE empresa_id=$1) AS returns,
      (SELECT count(*)::int FROM public.devolucion_venta_linea dvl JOIN public.devolucion_venta dv ON dv.id=dvl.devolucion_id WHERE dv.empresa_id=$1) AS return_lines,
      (SELECT count(*)::int FROM public.devolucion_venta_pago dp JOIN public.devolucion_venta dv ON dv.id=dp.devolucion_id WHERE dv.empresa_id=$1) AS return_payments,
      (SELECT count(*)::int FROM public.devolucion_venta_lote dvl JOIN public.devolucion_venta_linea dl ON dl.id=dvl.devolucion_linea_id JOIN public.devolucion_venta dv ON dv.id=dl.devolucion_id WHERE dv.empresa_id=$1) AS return_lots,
      (SELECT count(*)::int FROM public.caja_movimiento WHERE devolucion_venta_id IN (SELECT id FROM public.devolucion_venta WHERE empresa_id=$1)) AS cash_movements
  `, [spec.empresaId]);
  let stock = null;
  if (spec.stock?.variantId) {
    const r = await client.query(
      'SELECT stock FROM public.producto_variante_stock WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4',
      [spec.empresaId, spec.sucursalId, spec.stock.productId, spec.stock.variantId]
    );
    assert.equal(r.rowCount, 1, 'variant stock fixture row must exist');
    stock = Number(r.rows[0].stock);
  } else if (spec.stock?.productId) {
    const r = await client.query(
      'SELECT stock FROM public.producto_stock WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3',
      [spec.empresaId, spec.sucursalId, spec.stock.productId]
    );
    assert.equal(r.rowCount, 1, 'product stock fixture row must exist');
    stock = Number(r.rows[0].stock);
  }
  const lotRows = await client.query(
    `SELECT id,codigo_lote,cantidad_disponible FROM public.inventario_lote
     WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3
       AND variante_id IS NOT DISTINCT FROM $4 ORDER BY id`,
    [spec.empresaId, spec.sucursalId, spec.stock.productId, spec.stock.variantId ?? null]
  );
  return {
    counts: counts.rows[0], stock,
    lots: lotRows.rows.map(x => ({ id: Number(x.id), code: x.codigo_lote, available: Number(x.cantidad_disponible) }))
  };
}

async function invokeReturn(client, scenario) {
  const r = await client.query(
    'SELECT public.pos_devolucion_registrar_auth($1::integer,$2::jsonb) AS result',
    [scenario.comprobanteId, JSON.stringify(scenario.payload)]
  );
  return r.rows[0].result;
}

test('returns staging is opt-in and never connects without explicit confirmation plus fixture', {
  skip: !enabled
}, async (t) => {
  assert.ok(fixture.authUserId, 'fixture.authUserId is required');
  assert.ok(Array.isArray(fixture.successCases) && fixture.successCases.length, 'successCases is required');
  assert.ok(fixture.rollbackCase?.payload, 'rollbackCase.payload is required');

  for (const scenario of fixture.successCases) {
    await t.test(`FEFO return, cash reconciliation and idempotent replay: ${scenario.name}`, async () => {
      const client = new Client(connectionConfig());
      await client.connect();
      try {
        await beginAsAuthenticated(client, fixture.authUserId);
        await client.query('RESET ROLE');
        const before = await snapshot(client, scenario);
        await client.query('SET LOCAL ROLE authenticated');
        const result = await invokeReturn(client, scenario);
        assert.ok(result.id, JSON.stringify(result));
        assert.equal(result.reintento, false);
        assert.equal(result.trazabilidadRepetida, false);
        assert.ok(Number(result.lotesRestituidos) >= 0);

        await client.query('RESET ROLE');
        const header = await client.query(
          'SELECT id,comprobante_id,estado,total_devolucion,monto_reembolsado FROM public.devolucion_venta WHERE id=$1',
          [result.id]
        );
        assert.equal(header.rowCount, 1);
        assert.equal(Number(header.rows[0].comprobante_id), Number(scenario.comprobanteId));
        assert.equal(header.rows[0].estado, 'REGISTRADA');

        const allocations = await client.query(
          `SELECT il.codigo_lote,dvl.cantidad FROM public.devolucion_venta_lote dvl
           JOIN public.inventario_lote il ON il.id=dvl.lote_id
           JOIN public.devolucion_venta_linea dl ON dl.id=dvl.devolucion_linea_id
           WHERE dl.devolucion_id=$1 ORDER BY il.id`,
          [result.id]
        );
        if (scenario.expected?.lotCodes) {
          assert.deepEqual([...new Set(allocations.rows.map(x => x.codigo_lote))].sort(),
            [...scenario.expected.lotCodes].sort());
        }
        if (scenario.expected?.restoredQuantity !== undefined) {
          const total = allocations.rows.reduce((sum, x) => sum + Number(x.cantidad), 0);
          assert.ok(Math.abs(total - Number(scenario.expected.restoredQuantity)) < 0.001);
        }

        const payments = await client.query(
          'SELECT metodo_pago,monto FROM public.devolucion_venta_pago WHERE devolucion_id=$1 ORDER BY metodo_pago',
          [result.id]
        );
        assert.equal(payments.rowCount, scenario.expected.paymentCount);
        const paid = payments.rows.reduce((sum, x) => sum + Number(x.monto), 0);
        assert.ok(Math.abs(paid - Number(header.rows[0].monto_reembolsado)) <= 0.01);

        const after = await snapshot(client, scenario);
        if (scenario.expected?.stockDelta !== undefined) {
          assert.ok(Math.abs(after.stock - before.stock - Number(scenario.expected.stockDelta)) < 0.001);
        }
        if (scenario.expected?.cashMovementCount !== undefined) {
          assert.equal(after.counts.cash_movements - before.counts.cash_movements,
            scenario.expected.cashMovementCount);
        }

        await client.query('SET LOCAL ROLE authenticated');
        const replay = await invokeReturn(client, scenario);
        assert.equal(Number(replay.id), Number(result.id));
        assert.equal(replay.reintento, true);
        assert.equal(replay.trazabilidadRepetida, true);
        await client.query('RESET ROLE');
        const afterReplay = await snapshot(client, scenario);
        assert.deepEqual(afterReplay, after, 'replay must not duplicate stock, lots, payments or cash');
      } finally {
        try { await client.query('ROLLBACK'); } catch {}
        await client.end();
      }
    });
  }

  await t.test('failed return rolls back all effects', async () => {
    const scenario = fixture.rollbackCase;
    const client = new Client(connectionConfig());
    await client.connect();
    try {
      await beginAsAuthenticated(client, fixture.authUserId);
      await client.query('RESET ROLE');
      const before = await snapshot(client, scenario);
      await client.query('SAVEPOINT before_expected_failure');
      await client.query('SET LOCAL ROLE authenticated');
      let thrown;
      try { await invokeReturn(client, scenario); } catch (error) { thrown = error; }
      assert.ok(thrown, 'rollback scenario must fail');
      assert.match(String(thrown.message), new RegExp(scenario.expectedError || '23514'));
      await client.query('ROLLBACK TO SAVEPOINT before_expected_failure');
      await client.query('RESET ROLE');
      const after = await snapshot(client, scenario);
      assert.deepEqual(after, before, 'failed return must leave inventory, lots and ledgers unchanged');
    } finally {
      try { await client.query('ROLLBACK'); } catch {}
      await client.end();
    }
  });
});
