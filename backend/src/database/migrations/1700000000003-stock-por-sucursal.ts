import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migra el stock global histórico a saldos independientes por sucursal.
 * Para no duplicar existencias, el saldo anterior se asigna a la sucursal
 * de menor ID de cada empresa; las demás sucursales parten en cero.
 */
export class StockPorSucursal1700000000003 implements MigrationInterface {
  name = 'StockPorSucursal1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM producto p WHERE NOT EXISTS (SELECT 1 FROM sucursal s WHERE s.empresa_id = p.empresa_id)) THEN
          RAISE EXCEPTION 'No se puede migrar inventario: hay productos de empresas sin sucursal asociada. Cree una sucursal para cada empresa y vuelva a ejecutar la migración.';
        END IF;
      END;
      $$;

      ALTER TABLE producto ADD CONSTRAINT uq_producto_id_empresa UNIQUE (id, empresa_id);
      ALTER TABLE sucursal ADD CONSTRAINT uq_sucursal_id_empresa UNIQUE (id, empresa_id);

      CREATE TABLE producto_stock (
        producto_id INTEGER NOT NULL,
        sucursal_id INTEGER NOT NULL,
        empresa_id INTEGER NOT NULL,
        stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock >= 0),
        stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (producto_id, sucursal_id),
        CONSTRAINT fk_producto_stock_producto_empresa
          FOREIGN KEY (producto_id, empresa_id) REFERENCES producto(id, empresa_id) ON DELETE CASCADE,
        CONSTRAINT fk_producto_stock_sucursal_empresa
          FOREIGN KEY (sucursal_id, empresa_id) REFERENCES sucursal(id, empresa_id) ON DELETE CASCADE
      );
      CREATE INDEX idx_producto_stock_sucursal ON producto_stock(empresa_id, sucursal_id, producto_id);

      -- Backfill sin duplicar: todo el saldo antiguo queda en una única sucursal.
      INSERT INTO producto_stock (producto_id, sucursal_id, empresa_id, stock, stock_minimo)
      SELECT p.id, s.id, p.empresa_id,
        CASE WHEN s.id = (SELECT MIN(s2.id) FROM sucursal s2 WHERE s2.empresa_id = p.empresa_id)
          THEN p.stock ELSE 0 END,
        p.stock_minimo
      FROM producto p
      INNER JOIN sucursal s ON s.empresa_id = p.empresa_id;

      -- La columna antigua se conserva por compatibilidad de esquema, pero deja de ser fuente de verdad.
      UPDATE producto SET stock = 0;

      CREATE OR REPLACE FUNCTION crear_stock_para_producto_nuevo()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO producto_stock (producto_id, sucursal_id, empresa_id, stock, stock_minimo)
        SELECT NEW.id, s.id, NEW.empresa_id, 0, NEW.stock_minimo
        FROM sucursal s WHERE s.empresa_id = NEW.empresa_id
        ON CONFLICT (producto_id, sucursal_id) DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION crear_stock_para_sucursal_nueva()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO producto_stock (producto_id, sucursal_id, empresa_id, stock, stock_minimo)
        SELECT p.id, NEW.id, NEW.empresa_id, 0, p.stock_minimo
        FROM producto p WHERE p.empresa_id = NEW.empresa_id
        ON CONFLICT (producto_id, sucursal_id) DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_producto_stock_nuevo
        AFTER INSERT ON producto FOR EACH ROW EXECUTE FUNCTION crear_stock_para_producto_nuevo();
      CREATE TRIGGER trg_sucursal_stock_nueva
        AFTER INSERT ON sucursal FOR EACH ROW EXECUTE FUNCTION crear_stock_para_sucursal_nueva();

      CREATE TABLE transferencia_inventario (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_origen_id INTEGER NOT NULL,
        sucursal_destino_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        motivo VARCHAR(200) NOT NULL,
        idempotency_key VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_transferencia_sucursales_distintas CHECK (sucursal_origen_id <> sucursal_destino_id),
        CONSTRAINT fk_transferencia_origen_empresa
          FOREIGN KEY (sucursal_origen_id, empresa_id) REFERENCES sucursal(id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_transferencia_destino_empresa
          FOREIGN KEY (sucursal_destino_id, empresa_id) REFERENCES sucursal(id, empresa_id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_transferencia_empresa_fecha ON transferencia_inventario(empresa_id, created_at DESC);
      CREATE UNIQUE INDEX uq_transferencia_empresa_usuario_idempotency
        ON transferencia_inventario(empresa_id, usuario_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

      ALTER TABLE movimiento_inventario ADD COLUMN stock_anterior NUMERIC(12,3);
      ALTER TABLE movimiento_inventario ADD COLUMN stock_posterior NUMERIC(12,3);
      ALTER TABLE movimiento_inventario ADD COLUMN transferencia_id INTEGER REFERENCES transferencia_inventario(id) ON DELETE SET NULL;
      CREATE INDEX idx_producto_stock_updated ON producto_stock(sucursal_id, updated_at DESC);
      CREATE INDEX idx_movimiento_transferencia ON movimiento_inventario(transferencia_id) WHERE transferencia_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se copia el stock multisucursal a la columna antigua: esa operación
    // perdería la distribución por sucursal. La reversión requiere respaldo.
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_producto_stock_nuevo ON producto;
      DROP TRIGGER IF EXISTS trg_sucursal_stock_nueva ON sucursal;
      DROP FUNCTION IF EXISTS crear_stock_para_producto_nuevo();
      DROP FUNCTION IF EXISTS crear_stock_para_sucursal_nueva();
      DROP INDEX IF EXISTS idx_producto_stock_updated;
      DROP INDEX IF EXISTS idx_movimiento_transferencia;
      DROP INDEX IF EXISTS uq_transferencia_empresa_usuario_idempotency;
      ALTER TABLE movimiento_inventario DROP COLUMN IF EXISTS transferencia_id;
      ALTER TABLE movimiento_inventario DROP COLUMN IF EXISTS stock_anterior;
      ALTER TABLE movimiento_inventario DROP COLUMN IF EXISTS stock_posterior;
      DROP TABLE IF EXISTS transferencia_inventario;
      DROP TABLE IF EXISTS producto_stock;
      ALTER TABLE sucursal DROP CONSTRAINT IF EXISTS uq_sucursal_id_empresa;
      ALTER TABLE producto DROP CONSTRAINT IF EXISTS uq_producto_id_empresa;
    `);
  }
}
