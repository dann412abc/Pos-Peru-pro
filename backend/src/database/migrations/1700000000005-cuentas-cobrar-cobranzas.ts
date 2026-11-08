import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cuentas por cobrar, crédito mixto y cobranzas parciales con trazabilidad de caja. */
export class CuentasCobrarCobranzas1700000000005 implements MigrationInterface {
  name = 'CuentasCobrarCobranzas1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_cliente_id_empresa' AND conrelid = 'cliente'::regclass) THEN
          ALTER TABLE cliente ADD CONSTRAINT uq_cliente_id_empresa UNIQUE (id, empresa_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_comprobante_id_empresa' AND conrelid = 'comprobante'::regclass) THEN
          ALTER TABLE comprobante ADD CONSTRAINT uq_comprobante_id_empresa UNIQUE (id, empresa_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_caja_id_sucursal' AND conrelid = 'caja'::regclass) THEN
          ALTER TABLE caja ADD CONSTRAINT uq_caja_id_sucursal UNIQUE (id, sucursal_id);
        END IF;
      END $$;

      CREATE TABLE cuenta_cobrar (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL,
        comprobante_id INTEGER NOT NULL,
        cliente_id INTEGER NOT NULL,
        total_credito NUMERIC(12,2) NOT NULL CHECK (total_credito > 0),
        saldo_pendiente NUMERIC(12,2) NOT NULL CHECK (saldo_pendiente >= 0 AND saldo_pendiente <= total_credito),
        fecha_vencimiento DATE NOT NULL DEFAULT (((NOW() AT TIME ZONE 'America/Lima')::date) + 30),
        estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
          CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADA','ANULADA')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_cuenta_cobrar_comprobante UNIQUE (comprobante_id),
        CONSTRAINT uq_cuenta_cobrar_id_sucursal_empresa UNIQUE (id, sucursal_id, empresa_id),
        CONSTRAINT ck_cuenta_cobrar_estado_saldo CHECK (
          (estado IN ('PENDIENTE','PARCIAL') AND saldo_pendiente > 0)
          OR (estado IN ('PAGADA','ANULADA') AND saldo_pendiente = 0)
        ),
        CONSTRAINT fk_cuenta_cobrar_sucursal_empresa FOREIGN KEY (sucursal_id, empresa_id)
          REFERENCES sucursal(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_cuenta_cobrar_comprobante_empresa FOREIGN KEY (comprobante_id, empresa_id)
          REFERENCES comprobante(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_cuenta_cobrar_cliente_empresa FOREIGN KEY (cliente_id, empresa_id)
          REFERENCES cliente(id, empresa_id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_cuenta_cobrar_empresa_sucursal_estado
        ON cuenta_cobrar(empresa_id, sucursal_id, estado, fecha_vencimiento);
      CREATE INDEX idx_cuenta_cobrar_cliente
        ON cuenta_cobrar(empresa_id, cliente_id, estado);

      CREATE TABLE cobro_cliente (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL,
        cuenta_cobrar_id BIGINT NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        caja_id INTEGER,
        metodo_pago VARCHAR(15) NOT NULL
          CHECK (metodo_pago IN ('EFECTIVO','TARJETA','YAPE','PLIN','TRANSFERENCIA')),
        monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
        referencia VARCHAR(120),
        idempotency_key VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_cobro_cliente_sucursal_empresa FOREIGN KEY (sucursal_id, empresa_id)
          REFERENCES sucursal(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_cobro_cliente_cuenta_sucursal_empresa FOREIGN KEY (cuenta_cobrar_id, sucursal_id, empresa_id)
          REFERENCES cuenta_cobrar(id, sucursal_id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_cobro_cliente_caja_sucursal FOREIGN KEY (caja_id, sucursal_id)
          REFERENCES caja(id, sucursal_id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_cobro_cliente_cuenta_fecha ON cobro_cliente(cuenta_cobrar_id, created_at DESC);
      CREATE UNIQUE INDEX uq_cobro_cliente_empresa_idempotency
        ON cobro_cliente(empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

      ALTER TABLE caja_movimiento
        ADD COLUMN IF NOT EXISTS cobro_cliente_id BIGINT REFERENCES cobro_cliente(id) ON DELETE SET NULL;
      CREATE INDEX idx_caja_movimiento_cobro_cliente
        ON caja_movimiento(cobro_cliente_id) WHERE cobro_cliente_id IS NOT NULL;

      -- Reconstruye cuentas de las ventas a crédito existentes sin volver a incrementar el saldo.
      WITH credito AS (
        SELECT c.id AS comprobante_id, c.empresa_id, c.sucursal_id, c.cliente_id,
               SUM(cp.monto)::numeric(12,2) AS total_credito,
               (c.fecha_emision AT TIME ZONE 'America/Lima')::date + 30 AS fecha_vencimiento
        FROM comprobante c
        INNER JOIN comprobante_pago cp ON cp.comprobante_id = c.id
        WHERE cp.metodo_pago = 'CREDITO' AND c.estado <> 'ANULADA'
        GROUP BY c.id, c.empresa_id, c.sucursal_id, c.cliente_id, c.fecha_emision
      )
      INSERT INTO cuenta_cobrar
        (empresa_id, sucursal_id, comprobante_id, cliente_id, total_credito, saldo_pendiente, fecha_vencimiento, estado)
      SELECT empresa_id, sucursal_id, comprobante_id, cliente_id, total_credito, total_credito,
             fecha_vencimiento, 'PENDIENTE'
      FROM credito
      ON CONFLICT (comprobante_id) DO NOTHING;

      -- Los comprobantes históricos con saldo de crédito no deben mostrarse como pagados.
      UPDATE comprobante c
      SET estado = 'PENDIENTE'
      FROM cuenta_cobrar cc
      WHERE cc.comprobante_id = c.id AND cc.empresa_id = c.empresa_id
        AND cc.saldo_pendiente > 0 AND cc.estado IN ('PENDIENTE','PARCIAL')
        AND c.estado <> 'ANULADA';

      -- El saldo de crédito pasa a ser derivado de cuentas vigentes y se reconcilia una sola vez.
      UPDATE cliente cl
      SET saldo_credito = COALESCE((
        SELECT SUM(cc.saldo_pendiente)
        FROM cuenta_cobrar cc
        WHERE cc.cliente_id = cl.id AND cc.empresa_id = cl.empresa_id AND cc.estado <> 'ANULADA'
      ), 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los cobros son registros financieros; revertirlos requiere restaurar respaldo.
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_caja_movimiento_cobro_cliente;
      ALTER TABLE caja_movimiento DROP COLUMN IF EXISTS cobro_cliente_id;
      DROP INDEX IF EXISTS uq_cobro_cliente_empresa_idempotency;
      DROP INDEX IF EXISTS idx_cobro_cliente_cuenta_fecha;
      DROP TABLE IF EXISTS cobro_cliente;
      DROP INDEX IF EXISTS idx_cuenta_cobrar_cliente;
      DROP INDEX IF EXISTS idx_cuenta_cobrar_empresa_sucursal_estado;
      DROP TABLE IF EXISTS cuenta_cobrar;
      ALTER TABLE comprobante DROP CONSTRAINT IF EXISTS uq_comprobante_id_empresa;
      ALTER TABLE cliente DROP CONSTRAINT IF EXISTS uq_cliente_id_empresa;
      ALTER TABLE caja DROP CONSTRAINT IF EXISTS uq_caja_id_sucursal;
    `);
  }
}
