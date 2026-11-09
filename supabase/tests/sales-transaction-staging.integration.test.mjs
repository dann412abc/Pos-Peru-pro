import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = process.env.POS_SALES_FIXTURE;
const enabled = process.env.POS_SALES_STAGING_CONFIRM === 'YES' && Boolean(fixturePath);
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
    if (!process.env[key]) throw new Error(`Missing ${key}; staging integration tests require an explicit database connection.`);
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
    application_name: 'mi-carrito-pos-sales-staging-tests'
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
  // Restore the connection role (normally postgres/service_role) only for
  // assertions; the RPC itself is always invoked as authenticated.
  await client.query('RESET ROLE');
}

async function readSnapshot(client, spec) {
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.comprobante WHERE empresa_id=$1) AS comprobantes,
      (SELECT count(*)::int FROM public.comprobante_pago cp
         JOIN public.comprobante c ON c.id=cp.comprobante_id WHERE c.empresa_id=$1) AS pagos,
      (SELECT count(*)::int FROM public.movimiento_inventario WHERE empresa_id=$1) AS movimientos_inventario,
      (SELECT count(*)::int FROM public.comprobante_lote_salida WHERE empresa_id=$1) AS salidas_lote,
      (SELECT count(*)::int FROM public.cuenta_cobrar WHERE empresa_id=$1) AS cuentas,
      (SELECT count(*)::int FROM public.caja_movimiento cm
         JOIN public.caja ca ON ca.id=cm.caja_id
         JOIN public.sucursal su ON su.id=ca.sucursal_id
         WHERE su.empresa_id=$1 AND su.id=$2) AS movimientos_caja,
      (SELECT ultimo_correlativo FROM public.serie_correlativo
         WHERE sucursal_id=$2 AND tipo_comprobante=$3 AND serie=$4) AS ultimo_correlativo
  `, [spec.empresaId, spec.sucursalId, spec.tipoComprobante || null, spec.serie || null]);
  let stock = null;
  if (spec.stock?.variantId) {
    const r = await client.query(
      `SELECT stock FROM public.producto_variante_stock
       WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3 AND variante_id=$4`,
      [spec.empresaId, spec.sucursalId, spec.stock.productId, spec.stock.variantId]
    );
    assert.equal(r.rowCount, 1, 'variant stock fixture row must exist');
    stock = Number(r.rows[0].stock);
  } else if (spec.stock?.productId) {
    const r = await client.query(
      `SELECT stock FROM public.producto_stock
       WHERE empresa_id=$1 AND sucursal_id=$2 AND producto_id=$3`,
      [spec.empresaId, spec.sucursalId, spec.stock.productId]
    );
    assert.equal(r.rowCount, 1, 'product stock fixture row must exist');
    stock = Number(r.rows[0].stock);
  }
  let credit = null;
  if (spec.creditCustomerId) {
    const r = await client.query(
      'SELECT saldo_credito FROM public.cliente WHERE empresa_id=$1 AND id=$2',
      [spec.empresaId, spec.creditCustomerId]
    );
    assert.equal(r.rowCount, 1, 'credit customer fixture row must exist');
    credit = Number(r.rows[0].saldo_credito);
  }
  return { counts: counts.rows[0], stock, credit };
}

async function invokeSale(client, payload) {
  const r = await client.query(
    'SELECT public.pos_venta_crear_auth($1::jsonb) AS result',
    [JSON.stringify(payload)]
  );
  return r.rows[0].result;
}

test('staging harness requires explicit opt-in and a fixture', { skip: !enabled }, async (t) => {
  assert.ok(fixture.authUserId, 'fixture.authUserId is required');
  assert.ok(Array.isArray(fixture.successCases) && fixture.successCases.length > 0,
    'fixture.successCases must contain at least one sale scenario');
  assert.ok(fixture.rollbackCase?.payload, 'fixture.rollbackCase.payload is required');

  for (const scenario of fixture.successCases) {
    await t.test(`transaction success + idempotent replay: ${scenario.name}`, async () => {
      const client = new Client(connectionConfig());
      await client.connect();
      try {
        await beginAsAuthenticated(client, fixture.authUserId);
        await setPrivilegedAssertionRole(client);
        const before = await readSnapshot(client, scenario);
        await setAuthenticatedRole(client);
        const result = await invokeSale(client, scenario.payload);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.ok(result.comprobanteId, 'RPC must return comprobanteId');

        // El detalle oficial debe poder recuperarse con el mismo JWT autenticado
        // y la lectura no debe alterar ningún efecto de la venta.
        const detail = await client.query(
          'SELECT public.pos_comprobante_detalle_auth($1::integer) AS detail',
          [result.comprobanteId]
        );
        const official = detail.rows[0].detail;
        assert.equal(Number(official.id), Number(result.comprobanteId));
        assert.equal(Number(official.empresaId), Number(scenario.empresaId));
        assert.equal(Number(official.sucursalId), Number(scenario.sucursalId));
        assert.ok(Array.isArray(official.lineas) && official.lineas.length > 0,
          'official detail must include sale lines');
        assert.ok(Array.isArray(official.pagos) && official.pagos.length > 0,
          'official detail must include payment rows');
        assert.ok(official.cliente && typeof official.cliente === 'object',
          'official detail must include customer snapshot');
        const officialPaid = official.pagos.reduce((sum, row) => sum + Number(row.monto), 0);
        assert.ok(Math.abs(officialPaid - Number(official.total)) <= 0.01,
          'official detail payment split must equal official total');

        await setPrivilegedAssertionRole(client);
        const header = await client.query(
          `SELECT id, empresa_id, sucursal_id, cliente_id, caja_id, total, estado
           FROM public.comprobante WHERE id=$1`,
          [result.comprobanteId]
        );
        assert.equal(header.rowCount, 1, 'created comprobante must be visible in the same transaction');
        assert.equal(Number(header.rows[0].empresa_id), Number(scenario.empresaId));
        assert.equal(Number(header.rows[0].sucursal_id), Number(scenario.sucursalId));

        const paymentRows = await client.query(
          'SELECT metodo_pago, monto FROM public.comprobante_pago WHERE comprobante_id=$1 ORDER BY id',
          [result.comprobanteId]
        );
        assert.equal(paymentRows.rowCount, scenario.expected.paymentCount);
        const paid = paymentRows.rows.reduce((sum, row) => sum + Number(row.monto), 0);
        assert.ok(Math.abs(paid - Number(header.rows[0].total)) <= 0.01, 'payment split must equal sale total');

        if (scenario.stock?.delta !== undefined) {
          const afterStock = await readSnapshot(client, scenario);
          assert.ok(Math.abs((before.stock - afterStock.stock) - Number(scenario.stock.delta)) < 0.001,
            'stock delta must match fixture');
        }

        if (scenario.expected.fefoLotIds) {
          const allocations = await client.query(
            `SELECT lote_id FROM public.comprobante_lote_salida
             WHERE comprobante_id=$1 ORDER BY id`,
            [result.comprobanteId]
          );
          assert.deepEqual(allocations.rows.map(x => Number(x.lote_id)), scenario.expected.fefoLotIds);
        }

        if (scenario.expected.creditDelta !== undefined) {
          const afterCredit = await readSnapshot(client, scenario);
          assert.ok(Math.abs((afterCredit.credit - before.credit) - Number(scenario.expected.creditDelta)) < 0.01,
            'customer credit balance must increase by financed amount');
        }

        const afterFirst = await readSnapshot(client, scenario);
        await setAuthenticatedRole(client);
        const replay = await invokeSale(client, scenario.payload);
        assert.equal(replay.decision, 'RETURN_EXISTING');
        assert.equal(Number(replay.comprobanteId), Number(result.comprobanteId));
        await setPrivilegedAssertionRole(client);
        const afterReplay = await readSnapshot(client, scenario);
        assert.deepEqual(afterReplay, afterFirst, 'idempotent replay must not mutate stock, credit, or ledgers');
      } finally {
        try { await client.query('ROLLBACK'); } catch {}
        await client.end();
      }
    });
  }

  await t.test('atomic rollback after header/payment/stock path when FEFO lots are insufficient', async () => {
    const spec = fixture.rollbackCase;
    const client = new Client(connectionConfig());
    await client.connect();
    try {
      await beginAsAuthenticated(client, fixture.authUserId);
      await setPrivilegedAssertionRole(client);
      const before = await readSnapshot(client, spec);
      await client.query('SAVEPOINT before_expected_failure');
      await setAuthenticatedRole(client);
      let thrown;
      try {
        await invokeSale(client, spec.payload);
      } catch (error) {
        thrown = error;
      }
      assert.ok(thrown, 'rollback scenario must fail');
      assert.ok(spec.tipoComprobante && spec.serie,
        'rollbackCase must identify tipoComprobante and serie to verify correlativo rollback');
      assert.notEqual(before.counts.ultimo_correlativo, null,
        'rollbackCase must have an existing serie_correlativo row');
      assert.match(String(thrown.message), new RegExp(spec.expectedError || 'SALE_FEFO_LOTS_INSUFFICIENT_OR_EXPIRED'));
      await client.query('ROLLBACK TO SAVEPOINT before_expected_failure');
      await setPrivilegedAssertionRole(client);
      const after = await readSnapshot(client, spec);
      assert.deepEqual(after, before, 'failed sale must leave all captured state unchanged');
    } finally {
      try { await client.query('ROLLBACK'); } catch {}
      await client.end();
    }
  });
});


test('concurrencia idempotente de dos sesiones (requiere permiso explícito para confirmar un caso de prueba)', {
  skip: !(enabled && process.env.POS_SALES_ALLOW_COMMIT_TESTS === 'YES' && fixture?.concurrencyCase?.payload)
}, async () => {
  const scenario = fixture.concurrencyCase;
  for (const field of ['paymentCount', 'inventoryMovementCount', 'lotOutputCount', 'cashMovementCount']) {
    assert.ok(Number.isInteger(scenario.expected?.[field]) && scenario.expected[field] >= 0,
      `concurrencyCase.expected.${field} must be a non-negative integer`);
  }
  const first = new Client(connectionConfig());
  const second = new Client(connectionConfig());
  await first.connect();
  await second.connect();
  try {
    await beginAsAuthenticated(first, fixture.authUserId);
    await setPrivilegedAssertionRole(first);
    const before = await readSnapshot(first, scenario);
    await setAuthenticatedRole(first);

    const firstResult = await invokeSale(first, scenario.payload);
    assert.equal(firstResult.ok, true, JSON.stringify(firstResult));
    assert.ok(firstResult.comprobanteId, 'first session must create a comprobante');

    // La segunda sesión queda esperando el advisory transaction lock hasta que
    // la primera confirma. Después debe recuperar el mismo comprobante.
    await beginAsAuthenticated(second, fixture.authUserId);
    const secondPromise = invokeSale(second, scenario.payload);
    await first.query('COMMIT');
    const secondResult = await secondPromise;
    assert.equal(secondResult.decision, 'RETURN_EXISTING');
    assert.equal(Number(secondResult.comprobanteId), Number(firstResult.comprobanteId));

    await setPrivilegedAssertionRole(second);
    const count = await second.query(
      'SELECT count(*)::int AS n FROM public.comprobante WHERE id=$1',
      [firstResult.comprobanteId]
    );
    assert.equal(count.rows[0].n, 1, 'only one comprobante may exist');

    const afterReplay = await readSnapshot(second, scenario);
    assert.equal(afterReplay.counts.comprobantes - before.counts.comprobantes, 1,
      'concurrent retry must create exactly one comprobante');
    assert.equal(afterReplay.counts.pagos - before.counts.pagos, scenario.expected.paymentCount,
      'concurrent retry must persist payments exactly once');
    assert.equal(afterReplay.counts.movimientos_inventario - before.counts.movimientos_inventario,
      scenario.expected.inventoryMovementCount,
      'concurrent retry must create inventory movements exactly once');
    assert.equal(afterReplay.counts.salidas_lote - before.counts.salidas_lote,
      scenario.expected.lotOutputCount,
      'concurrent retry must allocate FEFO lots exactly once');
    assert.equal(afterReplay.counts.movimientos_caja - before.counts.movimientos_caja,
      scenario.expected.cashMovementCount,
      'concurrent retry must create cash movements exactly once');
    if (scenario.stock?.delta !== undefined) {
      assert.ok(Math.abs((before.stock - afterReplay.stock) - Number(scenario.stock.delta)) < 0.001,
        'concurrent retry must decrement stock exactly once');
    }
    if (scenario.expected.creditDelta !== undefined) {
      assert.ok(Math.abs((afterReplay.credit - before.credit) - Number(scenario.expected.creditDelta)) < 0.01,
        'concurrent retry must apply customer credit exactly once');
    }
    await second.query('ROLLBACK');
  } finally {
    try { await first.query('ROLLBACK'); } catch {}
    try { await second.query('ROLLBACK'); } catch {}
    await first.end();
    await second.end();
  }
});

test('sin POS_SALES_STAGING_CONFIRM=YES no abre conexiones ni toca la base', { skip: enabled }, () => {
  assert.equal(enabled, false);
});
