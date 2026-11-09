import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'returns_concurrency_test',
  max: 8,
});
const schema = `returns_test_${randomUUID().replaceAll('-', '')}`;

async function withClient(fn) {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${schema}`);
    return await fn(client);
  } finally {
    client.release();
  }
}

async function registrar({ key, hash, qty, failAfterWrites = false }) {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`mi-carrito-pos:devolucion:501:101:${key}`],
      );
      const prior = await client.query(
        'SELECT request_hash FROM returns WHERE company_id=501 AND user_id=101 AND idempotency_key=$1',
        [key],
      );
      if (prior.rowCount) {
        if (prior.rows[0].request_hash !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
        await client.query('COMMIT');
        return 'DUPLICATE';
      }

      const source = await client.query(
        'SELECT quantity FROM sale_lines WHERE id=1 FOR UPDATE',
      );
      const returned = await client.query(
        'SELECT COALESCE(SUM(quantity),0)::numeric AS quantity FROM return_lines WHERE sale_line_id=1',
      );
      const remaining = Number(source.rows[0].quantity) - Number(returned.rows[0].quantity);
      if (qty > remaining) throw new Error('RETURN_QUANTITY_EXCEEDED');

      const header = await client.query(
        'INSERT INTO returns(company_id,user_id,idempotency_key,request_hash) VALUES(501,101,$1,$2) RETURNING id',
        [key, hash],
      );
      await client.query(
        'INSERT INTO return_lines(return_id,sale_line_id,quantity) VALUES($1,1,$2)',
        [header.rows[0].id, qty],
      );
      await client.query('UPDATE inventory SET quantity=quantity+$1 WHERE id=1', [qty]);
      await client.query(
        'INSERT INTO cash_movements(return_id,amount) VALUES($1,$2)',
        [header.rows[0].id, qty * 10],
      );
      if (failAfterWrites) throw new Error('INJECTED_FAILURE');
      await client.query('COMMIT');
      return 'CREATED';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  await withClient(async (client) => {
    await client.query(`
      CREATE TABLE sale_lines(id integer PRIMARY KEY, quantity numeric(12,3) NOT NULL);
      CREATE TABLE returns(
        id bigserial PRIMARY KEY, company_id integer NOT NULL, user_id integer NOT NULL,
        idempotency_key text NOT NULL, request_hash text NOT NULL,
        UNIQUE(company_id,user_id,idempotency_key)
      );
      CREATE TABLE return_lines(
        id bigserial PRIMARY KEY, return_id bigint NOT NULL REFERENCES returns(id),
        sale_line_id integer NOT NULL REFERENCES sale_lines(id), quantity numeric(12,3) NOT NULL CHECK(quantity>0)
      );
      CREATE TABLE inventory(id integer PRIMARY KEY, quantity numeric(12,3) NOT NULL);
      CREATE TABLE cash_movements(id bigserial PRIMARY KEY, return_id bigint NOT NULL REFERENCES returns(id), amount numeric(12,2) NOT NULL);
      INSERT INTO sale_lines VALUES(1,5);
      INSERT INTO inventory VALUES(1,0);
    `);
  });
});

beforeEach(async () => {
  await withClient(async (client) => {
    await client.query('TRUNCATE cash_movements, return_lines, returns RESTART IDENTITY');
    await client.query('UPDATE sale_lines SET quantity=5 WHERE id=1');
    await client.query('UPDATE inventory SET quantity=0 WHERE id=1');
  });
});

after(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await pool.end();
});

test('dos claves distintas no pueden devolver simultáneamente más unidades que las vendidas', async () => {
  const results = await Promise.allSettled([
    registrar({ key: 'key-concurrent-A', hash: 'hash-A', qty: 4 }),
    registrar({ key: 'key-concurrent-B', hash: 'hash-B', qty: 4 }),
  ]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter(x => x.status === 'rejected' && x.reason.message === 'RETURN_QUANTITY_EXCEEDED').length, 1);
  const state = await withClient(async c => c.query(`
    SELECT
      (SELECT COALESCE(SUM(quantity),0) FROM return_lines)::numeric AS returned,
      (SELECT quantity FROM inventory WHERE id=1)::numeric AS stock,
      (SELECT COUNT(*) FROM cash_movements)::int AS movements
  `));
  assert.equal(Number(state.rows[0].returned), 4);
  assert.equal(Number(state.rows[0].stock), 4);
  assert.equal(state.rows[0].movements, 1);
});

test('la misma clave y el mismo contenido producen una sola devolución', async () => {
  const results = await Promise.all([
    registrar({ key: 'same-key-retry', hash: 'same-hash', qty: 1 }),
    registrar({ key: 'same-key-retry', hash: 'same-hash', qty: 1 }),
  ]);
  assert.deepEqual(results.sort(), ['CREATED', 'DUPLICATE']);
  const count = await withClient(c => c.query(
    "SELECT COUNT(*)::int AS n FROM returns WHERE idempotency_key='same-key-retry'",
  ));
  assert.equal(count.rows[0].n, 1);
});

test('la misma clave con contenido distinto se rechaza', async () => {
  await registrar({ key: 'different-payload', hash: 'original-hash', qty: 1 });
  await assert.rejects(
    registrar({ key: 'different-payload', hash: 'changed-hash', qty: 1 }),
    /IDEMPOTENCY_CONFLICT/,
  );
});

test('una segunda devolución que excede el saldo disponible se rechaza', async () => {
  await registrar({ key: 'remaining-first', hash: 'h1', qty: 2 });
  await assert.rejects(
    registrar({ key: 'remaining-second', hash: 'h2', qty: 4 }),
    /RETURN_QUANTITY_EXCEEDED/,
  );
});

test('un error después de escribir revierte devolución, inventario y caja', async () => {
  const beforeState = await withClient(c => c.query(`
    SELECT (SELECT quantity FROM inventory WHERE id=1)::numeric AS stock,
           (SELECT COUNT(*) FROM returns)::int AS returns,
           (SELECT COUNT(*) FROM cash_movements)::int AS movements
  `));
  await assert.rejects(
    registrar({ key: 'forced-rollback', hash: 'rollback-hash', qty: 1, failAfterWrites: true }),
    /INJECTED_FAILURE/,
  );
  const afterState = await withClient(c => c.query(`
    SELECT (SELECT quantity FROM inventory WHERE id=1)::numeric AS stock,
           (SELECT COUNT(*) FROM returns)::int AS returns,
           (SELECT COUNT(*) FROM cash_movements)::int AS movements
  `));
  assert.deepEqual(afterState.rows[0], beforeState.rows[0]);
});
