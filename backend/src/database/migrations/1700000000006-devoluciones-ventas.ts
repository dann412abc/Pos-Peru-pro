import { MigrationInterface, QueryRunner } from 'typeorm';

/** Devoluciones parciales/totales, ajuste de cuentas por cobrar y reembolsos en caja. */
export class DevolucionesVentas1700000000006 implements MigrationInterface {
  name = 'DevolucionesVentas1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE cuenta_cobrar
        ADD COLUMN IF NOT EXISTS monto_revertido NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_revertido >= 0);
      ALTER TABLE cuenta_cobrar DROP CONSTRAINT IF EXISTS ck_cuenta_cobrar_estado_saldo;
      ALTER TABLE cuenta_cobrar DROP CONSTRAINT IF EXISTS cuenta_cobrar_estado_check;
      ALTER TABLE cuenta_cobrar ADD CONSTRAINT ck_cuenta_cobrar_estado_saldo CHECK (
        (estado IN ('PENDIENTE','PARCIAL') AND saldo_pendiente > 0)
        OR (estado IN ('PAGADA','AJUSTADA','ANULADA') AND saldo_pendiente = 0)
      );
      ALTER TABLE cuenta_cobrar ADD CONSTRAINT ck_cuenta_cobrar_estado CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADA','AJUSTADA','ANULADA'));

      CREATE TABLE devolucion_venta (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL,
        comprobante_id INTEGER NOT NULL,
        cliente_id INTEGER,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        caja_id INTEGER NOT NULL,
        motivo VARCHAR(500) NOT NULL,
        total_devolucion NUMERIC(12,2) NOT NULL CHECK (total_devolucion > 0),
        credito_revertido NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (credito_revertido >= 0),
        monto_reembolsado NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monto_reembolsado >= 0),
        estado VARCHAR(12) NOT NULL DEFAULT 'REGISTRADA' CHECK (estado IN ('REGISTRADA')),
        idempotency_key VARCHAR(100) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_devolucion_venta_distribucion CHECK (ABS(total_devolucion - credito_revertido - monto_reembolsado) <= 0.01),
        CONSTRAINT uq_devolucion_venta_id_sucursal_empresa UNIQUE (id, sucursal_id, empresa_id),
        CONSTRAINT uq_devolucion_venta_id_caja UNIQUE (id, caja_id),
        CONSTRAINT fk_devolucion_venta_sucursal_empresa FOREIGN KEY (sucursal_id, empresa_id)
          REFERENCES sucursal(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_devolucion_venta_comprobante_empresa FOREIGN KEY (comprobante_id, empresa_id)
          REFERENCES comprobante(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_devolucion_venta_cliente_empresa FOREIGN KEY (cliente_id, empresa_id)
          REFERENCES cliente(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_devolucion_venta_caja_sucursal FOREIGN KEY (caja_id, sucursal_id)
          REFERENCES caja(id, sucursal_id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_devolucion_venta_idempotency
        ON devolucion_venta(empresa_id, usuario_id, idempotency_key);
      CREATE INDEX idx_devolucion_venta_empresa_sucursal_fecha
        ON devolucion_venta(empresa_id, sucursal_id, created_at DESC);
      CREATE INDEX idx_devolucion_venta_comprobante ON devolucion_venta(comprobante_id, estado);

      CREATE TABLE devolucion_venta_linea (
        id BIGSERIAL PRIMARY KEY,
        devolucion_id BIGINT NOT NULL,
        empresa_id INTEGER NOT NULL,
        sucursal_id INTEGER NOT NULL,
        comprobante_linea_id INTEGER NOT NULL REFERENCES comprobante_linea(id) ON DELETE RESTRICT,
        producto_id INTEGER NOT NULL,
        cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
        monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
        reingresar_stock BOOLEAN NOT NULL DEFAULT TRUE,
        CONSTRAINT fk_devolucion_linea_header FOREIGN KEY (devolucion_id, sucursal_id, empresa_id)
          REFERENCES devolucion_venta(id, sucursal_id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_devolucion_linea_producto_empresa FOREIGN KEY (producto_id, empresa_id)
          REFERENCES producto(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT uq_devolucion_linea_origen UNIQUE (devolucion_id, comprobante_linea_id)
      );
      CREATE INDEX idx_devolucion_linea_origen ON devolucion_venta_linea(comprobante_linea_id);

      CREATE TABLE devolucion_venta_pago (
        id BIGSERIAL PRIMARY KEY,
        devolucion_id BIGINT NOT NULL,
        empresa_id INTEGER NOT NULL,
        sucursal_id INTEGER NOT NULL,
        metodo_pago VARCHAR(10) NOT NULL CHECK (metodo_pago IN ('EFECTIVO','TARJETA','YAPE','PLIN')),
        monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
        referencia VARCHAR(120),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_devolucion_pago_header FOREIGN KEY (devolucion_id, sucursal_id, empresa_id)
          REFERENCES devolucion_venta(id, sucursal_id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT uq_devolucion_pago_metodo UNIQUE (devolucion_id, metodo_pago)
      );
      CREATE INDEX idx_devolucion_pago_header ON devolucion_venta_pago(devolucion_id, created_at);

      ALTER TABLE caja_movimiento ADD COLUMN IF NOT EXISTS devolucion_venta_id BIGINT;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_caja_movimiento_devolucion_venta_caja') THEN
          ALTER TABLE caja_movimiento ADD CONSTRAINT fk_caja_movimiento_devolucion_venta_caja
            FOREIGN KEY (devolucion_venta_id,caja_id) REFERENCES devolucion_venta(id,caja_id) ON DELETE RESTRICT;
        END IF;
      END $$;
      CREATE INDEX idx_caja_movimiento_devolucion_venta
        ON caja_movimiento(devolucion_venta_id) WHERE devolucion_venta_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir una etapa con reembolsos registrados exige restaurar un respaldo contable.
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_caja_movimiento_devolucion_venta;
      ALTER TABLE caja_movimiento DROP CONSTRAINT IF EXISTS fk_caja_movimiento_devolucion_venta_caja;
      ALTER TABLE caja_movimiento DROP COLUMN IF EXISTS devolucion_venta_id;
      DROP TABLE IF EXISTS devolucion_venta_pago;
      DROP INDEX IF EXISTS idx_devolucion_linea_origen;
      DROP TABLE IF EXISTS devolucion_venta_linea;
      DROP INDEX IF EXISTS idx_devolucion_venta_comprobante;
      DROP INDEX IF EXISTS idx_devolucion_venta_empresa_sucursal_fecha;
      DROP INDEX IF EXISTS uq_devolucion_venta_idempotency;
      DROP TABLE IF EXISTS devolucion_venta;
      ALTER TABLE cuenta_cobrar DROP CONSTRAINT IF EXISTS ck_cuenta_cobrar_estado;
      ALTER TABLE cuenta_cobrar DROP CONSTRAINT IF EXISTS ck_cuenta_cobrar_estado_saldo;
      ALTER TABLE cuenta_cobrar ADD CONSTRAINT ck_cuenta_cobrar_estado_saldo CHECK (
        (estado IN ('PENDIENTE','PARCIAL') AND saldo_pendiente > 0)
        OR (estado IN ('PAGADA','ANULADA') AND saldo_pendiente = 0)
      );
      ALTER TABLE cuenta_cobrar DROP COLUMN IF EXISTS monto_revertido;
    `);
  }
}
