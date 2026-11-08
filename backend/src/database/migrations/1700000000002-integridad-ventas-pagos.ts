import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Endurece el registro de ventas: pagos desglosados, idempotencia para reintentos
 * offline y trazabilidad de entradas/salidas de inventario.
 */
export class IntegridadVentasPagos1700000000002 implements MigrationInterface {
  name = 'IntegridadVentasPagos1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE comprobante DROP CONSTRAINT IF EXISTS comprobante_metodo_pago_check;
      ALTER TABLE comprobante
        ADD CONSTRAINT comprobante_metodo_pago_check
        CHECK (metodo_pago IN ('EFECTIVO','TARJETA','YAPE','PLIN','CREDITO','MIXTO'));

      ALTER TABLE comprobante ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
      ALTER TABLE comprobante ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_empresa_idempotency
        ON comprobante (empresa_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS comprobante_pago (
        id SERIAL PRIMARY KEY,
        comprobante_id INTEGER NOT NULL REFERENCES comprobante(id) ON DELETE CASCADE,
        metodo_pago VARCHAR(10) NOT NULL CHECK (metodo_pago IN ('EFECTIVO','TARJETA','YAPE','PLIN','CREDITO')),
        monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
        monto_recibido NUMERIC(12,2),
        vuelto NUMERIC(12,2)
      );
      CREATE INDEX IF NOT EXISTS idx_comprobante_pago_comprobante ON comprobante_pago(comprobante_id);

      INSERT INTO comprobante_pago (comprobante_id, metodo_pago, monto, monto_recibido, vuelto)
      SELECT c.id, c.metodo_pago, c.total, c.monto_recibido, c.vuelto
      FROM comprobante c
      WHERE NOT EXISTS (
        SELECT 1 FROM comprobante_pago cp WHERE cp.comprobante_id = c.id
      ) AND c.total > 0;

      CREATE TABLE IF NOT EXISTS movimiento_inventario (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL REFERENCES sucursal(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES producto(id) ON DELETE RESTRICT,
        comprobante_id INTEGER REFERENCES comprobante(id) ON DELETE SET NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('SALIDA','ENTRADA')),
        cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
        motivo VARCHAR(200) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_movimiento_inventario_empresa_fecha
        ON movimiento_inventario(empresa_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_movimiento_inventario_producto_fecha
        ON movimiento_inventario(producto_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS caja_movimiento (
        id SERIAL PRIMARY KEY,
        caja_id INTEGER NOT NULL REFERENCES caja(id) ON DELETE CASCADE,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('INGRESO','SALIDA')),
        metodo_pago VARCHAR(10) NOT NULL CHECK (metodo_pago IN ('EFECTIVO','TARJETA','YAPE','PLIN')),
        monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
        motivo VARCHAR(200) NOT NULL,
        comprobante_id INTEGER REFERENCES comprobante(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_caja_movimiento_caja_fecha ON caja_movimiento(caja_id, created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS caja_movimiento;
      DROP TABLE IF EXISTS movimiento_inventario;
      DROP TABLE IF EXISTS comprobante_pago;
      DROP INDEX IF EXISTS uq_comprobante_empresa_idempotency;
      ALTER TABLE comprobante DROP COLUMN IF EXISTS idempotency_key;
      ALTER TABLE comprobante DROP COLUMN IF EXISTS motivo_anulacion;
      ALTER TABLE comprobante DROP CONSTRAINT IF EXISTS comprobante_metodo_pago_check;
      ALTER TABLE comprobante ADD CONSTRAINT comprobante_metodo_pago_check
        CHECK (metodo_pago IN ('EFECTIVO','TARJETA','YAPE','PLIN','CREDITO'));
    `);
  }
}
