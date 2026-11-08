import { MigrationInterface, QueryRunner } from 'typeorm';

/** Compras, proveedores, cuentas por pagar y costo promedio por sucursal. */
export class ComprasProveedoresCostos1700000000004 implements MigrationInterface {
  name = 'ComprasProveedoresCostos1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE producto_stock
        ADD COLUMN IF NOT EXISTS costo_promedio NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (costo_promedio >= 0);

      CREATE TABLE proveedor (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        tipo_doc VARCHAR(3) NOT NULL DEFAULT 'RUC' CHECK (tipo_doc IN ('RUC','DNI','OTRO')),
        numero VARCHAR(15) NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        direccion VARCHAR(300),
        telefono VARCHAR(30),
        email VARCHAR(160),
        contacto VARCHAR(120),
        observaciones VARCHAR(500),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_proveedor_empresa_documento UNIQUE (empresa_id, tipo_doc, numero),
        CONSTRAINT uq_proveedor_id_empresa UNIQUE (id, empresa_id)
      );
      CREATE INDEX idx_proveedor_empresa_nombre ON proveedor(empresa_id, lower(nombre));

      CREATE TABLE compra (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL,
        proveedor_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        tipo_documento VARCHAR(2) NOT NULL DEFAULT '01' CHECK (tipo_documento IN ('01','03','NV','OT')),
        serie VARCHAR(12) NOT NULL DEFAULT '',
        numero VARCHAR(30) NOT NULL DEFAULT '',
        fecha_documento DATE NOT NULL DEFAULT CURRENT_DATE,
        fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        condicion_pago VARCHAR(10) NOT NULL CHECK (condicion_pago IN ('CONTADO','CREDITO')),
        estado VARCHAR(12) NOT NULL DEFAULT 'RECIBIDA' CHECK (estado IN ('RECIBIDA','ANULADA')),
        op_gravadas NUMERIC(12,2) NOT NULL DEFAULT 0,
        op_exoneradas NUMERIC(12,2) NOT NULL DEFAULT 0,
        op_inafectas NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_igv NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL CHECK (total > 0),
        pagado NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pagado >= 0),
        saldo_pendiente NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0),
        idempotency_key VARCHAR(100),
        motivo_anulacion VARCHAR(500),
        CONSTRAINT fk_compra_sucursal_empresa FOREIGN KEY (sucursal_id, empresa_id)
          REFERENCES sucursal(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_compra_proveedor_empresa FOREIGN KEY (proveedor_id, empresa_id)
          REFERENCES proveedor(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT uq_compra_id_empresa UNIQUE (id, empresa_id),
        CONSTRAINT ck_compra_pagos_total CHECK (pagado + saldo_pendiente <= total + 0.01)
      );
      CREATE INDEX idx_compra_empresa_sucursal_fecha ON compra(empresa_id, sucursal_id, fecha_registro DESC);
      CREATE INDEX idx_compra_cuentas_por_pagar ON compra(empresa_id, sucursal_id, saldo_pendiente) WHERE estado = 'RECIBIDA' AND saldo_pendiente > 0;
      CREATE UNIQUE INDEX uq_compra_empresa_idempotency ON compra(empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE UNIQUE INDEX uq_compra_documento_proveedor ON compra(empresa_id, proveedor_id, tipo_documento, serie, numero)
        WHERE numero <> '';

      CREATE TABLE compra_linea (
        id BIGSERIAL PRIMARY KEY,
        compra_id BIGINT NOT NULL,
        empresa_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        numero_linea INTEGER NOT NULL,
        cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
        costo_unitario NUMERIC(12,4) NOT NULL CHECK (costo_unitario > 0),
        tipo_igv INTEGER NOT NULL CHECK (tipo_igv IN (10,20,30)),
        base_imponible NUMERIC(12,2) NOT NULL DEFAULT 0,
        igv NUMERIC(12,2) NOT NULL DEFAULT 0,
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        stock_anterior NUMERIC(12,3) NOT NULL DEFAULT 0,
        stock_posterior NUMERIC(12,3) NOT NULL DEFAULT 0,
        costo_promedio_anterior NUMERIC(12,4) NOT NULL DEFAULT 0,
        costo_promedio_posterior NUMERIC(12,4) NOT NULL DEFAULT 0,
        CONSTRAINT fk_compra_linea_compra_empresa FOREIGN KEY (compra_id, empresa_id)
          REFERENCES compra(id, empresa_id) ON DELETE CASCADE,
        CONSTRAINT fk_compra_linea_producto_empresa FOREIGN KEY (producto_id, empresa_id)
          REFERENCES producto(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT uq_compra_linea_producto UNIQUE (compra_id, producto_id)
      );
      CREATE INDEX idx_compra_linea_compra ON compra_linea(compra_id);

      CREATE TABLE compra_pago (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        compra_id BIGINT NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        caja_id INTEGER REFERENCES caja(id) ON DELETE RESTRICT,
        metodo_pago VARCHAR(15) NOT NULL CHECK (metodo_pago IN ('EFECTIVO','TARJETA','YAPE','PLIN','TRANSFERENCIA')),
        monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
        referencia VARCHAR(120),
        idempotency_key VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_compra_pago_compra_empresa FOREIGN KEY (compra_id, empresa_id)
          REFERENCES compra(id, empresa_id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_compra_pago_compra ON compra_pago(compra_id, created_at);
      CREATE UNIQUE INDEX uq_compra_pago_empresa_idempotency ON compra_pago(empresa_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      ALTER TABLE caja_movimiento ADD COLUMN IF NOT EXISTS compra_id BIGINT REFERENCES compra(id) ON DELETE SET NULL;
      ALTER TABLE movimiento_inventario ADD COLUMN IF NOT EXISTS compra_id BIGINT REFERENCES compra(id) ON DELETE SET NULL;
      CREATE INDEX idx_caja_movimiento_compra ON caja_movimiento(compra_id) WHERE compra_id IS NOT NULL;
      CREATE INDEX idx_movimiento_inventario_compra ON movimiento_inventario(compra_id) WHERE compra_id IS NOT NULL;
      ALTER TABLE comprobante_linea ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12,4) NOT NULL DEFAULT 0;
      CREATE INDEX idx_compra_proveedor_fecha ON compra(proveedor_id, fecha_registro DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_compra_proveedor_fecha;
      ALTER TABLE comprobante_linea DROP COLUMN IF EXISTS costo_unitario;
      DROP INDEX IF EXISTS idx_movimiento_inventario_compra;
      ALTER TABLE movimiento_inventario DROP COLUMN IF EXISTS compra_id;
      DROP INDEX IF EXISTS idx_caja_movimiento_compra;
      ALTER TABLE caja_movimiento DROP COLUMN IF EXISTS compra_id;
      DROP TABLE IF EXISTS compra_pago;
      DROP TABLE IF EXISTS compra_linea;
      DROP TABLE IF EXISTS compra;
      DROP TABLE IF EXISTS proveedor;
      ALTER TABLE producto_stock DROP COLUMN IF EXISTS costo_promedio;
    `);
  }
}
