import { MigrationInterface, QueryRunner } from 'typeorm';

/** Lotes FEFO y devoluciones a proveedores. Reversible; los movimientos quedan auditados. */
export class LotesDevolucionesProveedor1700000000007 implements MigrationInterface {
  name = 'LotesDevolucionesProveedor1700000000007';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='uq_comprobante_id_empresa') THEN ALTER TABLE comprobante ADD CONSTRAINT uq_comprobante_id_empresa UNIQUE(id,empresa_id); END IF; END $$;
      CREATE TABLE inventario_lote (
        id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, sucursal_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL, compra_id BIGINT, compra_linea_id BIGINT,
        codigo_lote VARCHAR(80) NOT NULL, fecha_vencimiento DATE, cantidad_inicial NUMERIC(12,3) NOT NULL CHECK(cantidad_inicial >= 0),
        cantidad_disponible NUMERIC(12,3) NOT NULL CHECK(cantidad_disponible >= 0),
        costo_unitario NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK(costo_unitario >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY (sucursal_id,empresa_id) REFERENCES sucursal(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY (producto_id,empresa_id) REFERENCES producto(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY (compra_id,empresa_id) REFERENCES compra(id,empresa_id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_lote_fefo ON inventario_lote(empresa_id,sucursal_id,producto_id,fecha_vencimiento,id) WHERE cantidad_disponible > 0;
      CREATE UNIQUE INDEX uq_lote_compra_linea ON inventario_lote(compra_linea_id) WHERE compra_linea_id IS NOT NULL;
      CREATE TABLE comprobante_lote_salida (
        id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, comprobante_id INTEGER NOT NULL,
        lote_id BIGINT NOT NULL REFERENCES inventario_lote(id) ON DELETE RESTRICT, producto_id INTEGER NOT NULL,
        cantidad NUMERIC(12,3) NOT NULL CHECK(cantidad>0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY(comprobante_id,empresa_id) REFERENCES comprobante(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY(producto_id,empresa_id) REFERENCES producto(id,empresa_id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_comprobante_lote_salida ON comprobante_lote_salida(empresa_id,comprobante_id,producto_id);
      INSERT INTO inventario_lote(empresa_id,sucursal_id,producto_id,codigo_lote,fecha_vencimiento,cantidad_inicial,cantidad_disponible,costo_unitario)
        SELECT empresa_id,sucursal_id,producto_id,'APERTURA-'||producto_id||'-'||sucursal_id,NULL,stock,stock,costo_promedio
        FROM producto_stock WHERE stock > 0;
      ALTER TABLE compra_linea ADD COLUMN IF NOT EXISTS codigo_lote VARCHAR(80);
      ALTER TABLE compra_linea ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;
      CREATE TABLE devolucion_proveedor (
        id BIGSERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL, sucursal_id INTEGER NOT NULL,
        compra_id BIGINT NOT NULL, proveedor_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        motivo VARCHAR(500) NOT NULL, total NUMERIC(12,2) NOT NULL CHECK(total > 0),
        aplicado_cuenta NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(aplicado_cuenta >= 0),
        saldo_a_favor NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(saldo_a_favor >= 0),
        idempotency_key VARCHAR(100) NOT NULL, request_hash VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY (sucursal_id,empresa_id) REFERENCES sucursal(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY (compra_id,empresa_id) REFERENCES compra(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY (proveedor_id,empresa_id) REFERENCES proveedor(id,empresa_id) ON DELETE RESTRICT,
        CONSTRAINT ck_devolucion_proveedor_suma CHECK(abs(total-aplicado_cuenta-saldo_a_favor)<=0.01)
      );
      CREATE UNIQUE INDEX uq_devolucion_proveedor_idempotency ON devolucion_proveedor(empresa_id,usuario_id,idempotency_key);
      CREATE TABLE devolucion_proveedor_linea (
        id BIGSERIAL PRIMARY KEY, devolucion_id BIGINT NOT NULL REFERENCES devolucion_proveedor(id) ON DELETE RESTRICT,
        empresa_id INTEGER NOT NULL, sucursal_id INTEGER NOT NULL, compra_linea_id BIGINT NOT NULL REFERENCES compra_linea(id) ON DELETE RESTRICT,
        lote_id BIGINT NOT NULL REFERENCES inventario_lote(id) ON DELETE RESTRICT, producto_id INTEGER NOT NULL,
        cantidad NUMERIC(12,3) NOT NULL CHECK(cantidad>0), costo_unitario NUMERIC(12,4) NOT NULL CHECK(costo_unitario>0),
        subtotal NUMERIC(12,2) NOT NULL CHECK(subtotal>0),
        FOREIGN KEY(producto_id,empresa_id) REFERENCES producto(id,empresa_id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_devolucion_proveedor_compra ON devolucion_proveedor(empresa_id,compra_id,created_at DESC);
      CREATE INDEX idx_devolucion_proveedor_linea_lote ON devolucion_proveedor_linea(lote_id);
    `);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM devolucion_proveedor) OR EXISTS(SELECT 1 FROM inventario_lote WHERE codigo_lote NOT LIKE 'APERTURA-%') OR EXISTS(SELECT 1 FROM comprobante_lote_salida) THEN
        RAISE EXCEPTION 'No se puede revertir lotes si se registraron movimientos operativos desde v1.6.0: exporte y regularice esos datos primero.';
      END IF;
    END $$;`);
    await q.query(`DROP TABLE IF EXISTS devolucion_proveedor_linea; DROP TABLE IF EXISTS devolucion_proveedor; DROP INDEX IF EXISTS idx_comprobante_lote_salida; DROP TABLE IF EXISTS comprobante_lote_salida; DROP INDEX IF EXISTS uq_lote_compra_linea; DROP INDEX IF EXISTS idx_lote_fefo; ALTER TABLE compra_linea DROP COLUMN IF EXISTS fecha_vencimiento; ALTER TABLE compra_linea DROP COLUMN IF EXISTS codigo_lote; DROP TABLE IF EXISTS inventario_lote;`);
    await q.query(`ALTER TABLE comprobante DROP CONSTRAINT IF EXISTS uq_comprobante_id_empresa`);
  }
}
