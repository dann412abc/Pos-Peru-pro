import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = process.env.POS_PURCHASE_FIXTURE;
const enabled = process.env.POS_PURCHASE_STAGING_CONFIRM === 'YES' && Boolean(fixturePath);
const require = createRequire(resolve(here, '../../backend/package.json'));
let Client;
let fixture;

if (enabled) {
  ({ Client } = require('pg'));
  fixture = JSON.parse(readFileSync(resolve(process.cwd(), fixturePath), 'utf8'));
}

function connectionConfig() {
  const required = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(\`Missing \${key}; purchase staging tests require an explicit database connection.\`);
  }
  if (process.env.PGHOST.includes('pooler.supabase.com') && !process.env.PGPORT) {
    throw new Error('Set PGPORT explicitly for the Supabase pooler.');
  }
  return {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
    application_name: 'mi-carrito-pos-purchase-staging-tests'
  };
}

async function beginAsAuthenticated(client, authUserId) {
  await client.query('BEGIN');
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [authUserId]);
  await client.query("SELECT set_config('request.jwt.claims', json_build_object('sub',$1,'role','authenticated')::text, true)", [authUserId]);
  await client.query('SET LOCAL ROLE authenticated');
}

async function setAuthenticatedRole(client) {
  await client.query('SET LOCAL ROLE authenticated');
}

async function setPrivilegedAssertionRole(client) {
  await client.query('RESET ROLE');
}

async function readSnapshot(client, spec) {
  const counts = await client.query(\`
    SELECT
      (SELECT count(*)::int FROM public.compra WHERE empresa_id=$1) AS purchases,
      (SELECT count(*)::int FROM public.compra_linea cl
         JOIN public.compra c ON c.id=cl.compra_id WHERE c.empresa_id=$1) AS purchase_lines,
      (SELECT count(*)::int FROM public.compra_pago cp
         JOIN public.compra c ON c.id=cp.compra_id WHERE c.empresa_id=$1) AS purchase_payments,
      (SELECT count(*)::int FROM public.inventario_lote WHERE empresa_id=$1 AND compra_id IS NOT NULL) AS lots,
      (SELECT count(*)::int FROM public.movimiento_inventario
         WHERE empresa_id=$1 AND compra_id IS NOT NULL) AS inventory_movements,
      (SELECT count(*)::int FROM public.caja_movimiento cm
         WHERE cm.compra_id IN (SELECT id FROM public.compra WHERE empresa_id=$1)) AS cash_movements
  \`, [spec.empresaId]);
  let stock = null;
  let averageCost = null;
  if (spec.stock?.variantId) {
    const r = await client.query(
      \`SELECT stock,costo_promedio FROM public.producto_variante_stock
       WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4\`,
      [spec.empresaId, spec.sucursalId, spec.stock.productId, spec.stock.variantId]
    );
    assert.equal(r.rowCount, 1, 'variant stock fixture row must exist');
    stock = Number(r.rows[0].stock);
    averageCost = r.rows[0].costo_promedio == null ? null : Number(r.rows[0].costo_promedio);
  } else if (spec.stock?.productId) {
    const r = await client.query(
      \`SELECT stock,costo_promedio FROM public.producto_stock
       WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3\`,
      [spec.empresaId, spec.sucursalId, spec.stock.productId]
    );
    assert.equal(r.rowCount, 1, 'product stock fixture row must exist');
    stock = Number(r.rows[0].stock);
    averageCost = r.rows[0].costo_promedio == null ? null : Number(r.rows[0].costo_promedio);
  }
  return { counts: counts.rows[0], stock, averageCost };
}

async function invokePurchase(client, payload) {
  const r = await client.query(
    'SELECT public.pos_compra_recibir_auth($1::jsonb) AS result',
    [JSON.stringify(payload)]
  );
  return r.rows[0].result;
}

function assertEffectCounts(before, after, expected) {
  const fields = {
    purchaseCount: 'purchases',
    purchaseLineCount: 'purchase_lines',
    paymentCount: 'purchase_payments',
    lotCount: 'lots',
    inventoryMovementCount: 'inventory_movements',
    cashMovementCount: 'cash_movements'
  };
  for (const [expectedField, countField] of Object.entries(fields)) {
    assert.ok(Number.isInteger(expected[expectedField]) && expected[expectedField] >= 0,
      \`expected.\${expectedField} must be a non-negative integer\`);
    assert.equal(after.counts[countField] - before.counts[countField], expected[expectedField],
      \`\${countField} must be written exactly once\`);
  }
}

test('purchase receipt staging requires explicit opt-in and a fixture', { skip: !enabled }, async (t) => {
  assert.ok(fixture.authUserId, 'fixture.authUserId is required');
  assert.ok(Array.isArray(fixture.successCases) && fixture.successCases.length > 0,
    'fixture.successCases must contain at least one purchase scenario');
  assert.ok(fixture.rollbackCase?.payload, 'fixture.rollbackCase.payload is required');

  for (const scenario of fixture.successCases) {
    await t.test(\`atomic receipt + idempotent replay: \${scenario.name}\`, async () => {
      const client = new Client(connectionConfig());
      await client.connect();
      try {
        await beginAsAuthenticated(client, fixture.authUserId);
        await setPrivilegedAssertionRole(client);
        const before = await readSnapshot(client, scenario);
        await setAuthenticatedRole(client);
        const result = await invokePurchase(client, scenario.payload);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.ok(result.compraId, 'RPC must return compraId');
        assert.equal(result.repetida, false);

        await setPrivilegedAssertionRole(client);
        const header = await client.query(
          \`SELECT id,empresa_id,sucursal_id,proveedor_id,total,pagado,saldo_pendiente,estado
           FROM public.compra WHERE id=$1\`,
          [result.compraId]
        );
        assert.equal(header.rowCount, 1, 'created purchase must be visible in the transaction');
        assert.equal(Number(header.rows[0].empresa_id), Number(scenario.empresaId));
        assert.equal(Number(header.rows[0].sucursal_id), Number(scenario.sucursalId));
        assert.equal(header.rows[0].estado, 'RECIBIDA');

        const payments = await client.query(
          'SELECT metodo_pago,monto,caja_id FROM public.compra_pago WHERE compra_id=$1 ORDER BY id',
          [result.compraId]
        );
        assert.equal(payments.rowCount, scenario.expected.paymentCount);
        const paid = payments.rows.reduce((sum, row) => sum + Number(row.monto), 0);
        assert.ok(Math.abs(paid - Number(header.rows[0].pagado)) <= 0.01,
          'purchase payment rows must equal paid amount');
        assert.ok(Math.abs(Number(header.rows[0].total) - Number(header.rows[0].pagado) - Number(header.rows[0].saldo_pendiente)) <= 0.01,
          'total must equal paid plus pending balance');

        const lines = await client.query(
          \`SELECT producto_id,variante_id,cantidad,costo_unitario,stock_anterior,stock_posterior,
                  costo_promedio_anterior,costo_promedio_posterior
           FROM public.compra_linea WHERE compra_id=$1 ORDER BY numero_linea\`,
          [result.compraId]
        );
        assert.equal(lines.rowCount, scenario.expected.purchaseLineCount);
        for (const line of lines.rows) {
          assert.ok(Math.abs(Number(line.stock_posterior) - Number(line.stock_anterior) - Number(line.cantidad)) < 0.001,
            'purchase line stock delta must equal received quantity');
        }

        const lots = await client.query(
          'SELECT codigo_lote,cantidad_inicial,cantidad_disponible,costo_unitario FROM public.inventario_lote WHERE compra_id=$1 ORDER BY id',
          [result.compraId]
        );
        assert.equal(lots.rowCount, scenario.expected.lotCount);
        for (const lot of lots.rows) {
          assert.ok(Math.abs(Number(lot.cantidad_inicial) - Number(lot.cantidad_disponible)) < 0.001,
            'new purchase lots must start fully available');
        }
        if (scenario.expected.lotCodes) {
          assert.deepEqual(lots.rows.map(row => row.codigo_lote), scenario.expected.lotCodes);
        }

        const firstSnapshot = await readSnapshot(client, scenario);
        assertEffectCounts(before, firstSnapshot, scenario.expected);
        if (scenario.stock?.delta !== undefined) {
          assert.ok(Math.abs((firstSnapshot.stock - before.stock) - Number(scenario.stock.delta)) < 0.001,
            'received stock delta must match fixture');
        }
        if (scenario.expected.averageCost !== undefined) {
          assert.ok(Math.abs(Number(firstSnapshot.averageCost) - Number(scenario.expected.averageCost)) < 0.0001,
            'weighted average cost must match fixture');
        }

        await setAuthenticatedRole(client);
        const replay = await invokePurchase(client, scenario.payload);
        assert.equal(replay.ok, true, JSON.stringify(replay));
        assert.equal(replay.repetida, true);
        assert.equal(Number(replay.compraId), Number(result.compraId));
        await setPrivilegedAssertionRole(client);
        const afterReplay = await readSnapshot(client, scenario);
        assert.deepEqual(afterReplay, firstSnapshot,
          'idempotent replay must not duplicate stock, lots, payments or ledgers');
      } finally {
        try { await client.query('ROLLBACK'); } catch {}
        await client.end();
      }
    });
  }

  await t.test('atomic rollback leaves purchase, stock, lots and ledgers unchanged', async () => {
    const scenario = fixture.rollbackCase;
    const client = new Client(connectionConfig());
    await client.connect();
    try {
      await beginAsAuthenticated(client, fixture.authUserId);
      await setPrivilegedAssertionRole(client);
      const before = await readSnapshot(client, scenario);
      await client.query('SAVEPOINT before_expected_failure');
      await setAuthenticatedRole(client);
      let thrown;
      try {
        await invokePurchase(client, scenario.payload);
      } catch (error) {
        thrown = error;
      }
      assert.ok(thrown, 'rollback scenario must fail');
      assert.match(String(thrown.message), new RegExp(scenario.expectedError || 'PURCHASE_CASH_NOT_ENOUGH'));
      await client.query('ROLLBACK TO SAVEPOINT before_expected_failure');
      await setPrivilegedAssertionRole(client);
      const after = await readSnapshot(client, scenario);
      assert.deepEqual(after, before, 'failed receipt must leave captured state unchanged');
    } finally {
      try { await client.query('ROLLBACK'); } catch {}
      await client.end();
    }
  });
});

test('purchase receipt concurrency idempotency requires explicit commit permission', {
  skip: !(enabled && process.env.POS_PURCHASE_ALLOW_COMMIT_TESTS === 'YES' && fixture?.concurrencyCase?.payload)
}, async () => {
  const scenario = fixture.concurrencyCase;
  assertEffectCounts(
    { counts: { purchases: 0, purchase_lines: 0, purchase_payments: 0, lots: 0, inventory_movements: 0, cash_movements: 0 } },
    { counts: {
      purchases: scenario.expected.purchaseCount,
      purchase_lines: scenario.expected.purchaseLineCount,
      purchase_payments: scenario.expected.paymentCount,
      lots: scenario.expected.lotCount,
      inventory_movements: scenario.expected.inventoryMovementCount,
      cash_movements: scenario.expected.cashMovementCount
    } },
    scenario.expected
  );
  const first = new Client(connectionConfig());
  const second = new Client(connectionConfig());
  await first.connect();
  await second.connect();
  try {
    await beginAsAuthenticated(first, fixture.authUserId);
    await setPrivilegedAssertionRole(first);
    const before = await readSnapshot(first, scenario);
    await setAuthenticatedRole(first);
    const firstResult = await invokePurchase(first, scenario.payload);
    assert.equal(firstResult.ok, true, JSON.stringify(firstResult));
    assert.ok(firstResult.compraId);

    await beginAsAuthenticated(second, fixture.authUserId);
    const secondPromise = invokePurchase(second, scenario.payload);
    await first.query('COMMIT');
    const secondResult = await secondPromise;
    assert.equal(secondResult.ok, true, JSON.stringify(secondResult));
    assert.equal(secondResult.repetida, true);
    assert.equal(Number(secondResult.compraId), Number(firstResult.compraId));

    await setPrivilegedAssertionRole(second);
    const after = await readSnapshot(second, scenario);
    assertEffectCounts(before, after, scenario.expected);
    if (scenario.stock?.delta !== undefined) {
      assert.ok(Math.abs((after.stock - before.stock) - Number(scenario.stock.delta)) < 0.001,
        'concurrent retry must add stock exactly once');
    }
    if (scenario.expected.averageCost !== undefined) {
      assert.ok(Math.abs(Number(after.averageCost) - Number(scenario.expected.averageCost)) < 0.0001,
        'concurrent retry must update average cost exactly once');
    }
    await second.query('ROLLBACK');
  } finally {
    try { await first.query('ROLLBACK'); } catch {}
    try { await second.query('ROLLBACK'); } catch {}
    await first.end();
    await second.end();
  }
});

test('without POS_PURCHASE_STAGING_CONFIRM=YES no database connection is opened', { skip: enabled }, () => {
  assert.equal(enabled, false);
});
