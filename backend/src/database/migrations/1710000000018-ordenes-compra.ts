import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrdenesCompra1710000000018 implements MigrationInterface {
  name = 'OrdenesCompra1710000000018';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE orden_compra (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL REFERENCES sucursal(id),
        proveedor_id INTEGER NOT NULL REFERENCES proveedor(id),
        usuario_id INTEGER NOT NULL REFERENCES usuario(id),
        numero_orden VARCHAR(30) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'
          CHECK (estado IN ('BORRADOR','ENVIADA','RECIBIDA_PARCIAL','RECIBIDA','CANCELADA')),
        fecha_orden DATE NOT NULL DEFAULT CURRENT_DATE,
        fecha_entrega_esperada DATE,
        observaciones VARCHAR(1000),
        total_estimado NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_estimado >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id, numero_orden)
      );
      CREATE TABLE orden_compra_linea (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        orden_compra_id BIGINT NOT NULL REFERENCES orden_compra(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES producto(id),
        variante_id INTEGER REFERENCES producto_variante(id),
        descripcion VARCHAR(240) NOT NULL,
        codigo VARCHAR(80),
        cantidad_solicitada NUMERIC(14,3) NOT NULL CHECK (cantidad_solicitada > 0),
        cantidad_recibida NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0),
        costo_unitario_estimado NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (costo_unitario_estimado >= 0),
        tipo_igv INTEGER NOT NULL DEFAULT 10 CHECK (tipo_igv IN (10,20,30)),
        unidad_compra VARCHAR(20) NOT NULL DEFAULT 'UNIDAD',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (cantidad_recibida <= cantidad_solicitada)
      );
      CREATE TABLE orden_compra_recepcion (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        orden_compra_id BIGINT NOT NULL REFERENCES orden_compra(id),
        compra_id BIGINT NOT NULL REFERENCES compra(id),
        usuario_id INTEGER NOT NULL REFERENCES usuario(id),
        idempotency_key VARCHAR(100) NOT NULL,
        total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id,idempotency_key),
        UNIQUE (empresa_id,compra_id)
      );
      CREATE INDEX idx_orden_compra_empresa_sucursal_fecha ON orden_compra(empresa_id,sucursal_id,fecha_orden DESC);
      CREATE INDEX idx_orden_compra_linea_orden ON orden_compra_linea(orden_compra_id);
      CREATE INDEX idx_orden_compra_recepcion_orden ON orden_compra_recepcion(orden_compra_id);
    `);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS orden_compra_recepcion; DROP TABLE IF EXISTS orden_compra_linea; DROP TABLE IF EXISTS orden_compra;');
  }
}
