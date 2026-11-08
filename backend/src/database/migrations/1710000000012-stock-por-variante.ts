import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Existencias independientes de cada variante por sucursal.
 * Las variantes existentes empiezan en cero: nunca se copia automáticamente
 * el stock del producto padre porque eso duplicaría inventario.
 */
export class StockPorVariante1710000000012 implements MigrationInterface {
  name = 'StockPorVariante1710000000012';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_variante_id_producto_empresa
        ON producto_variante(id, producto_id, empresa_id);

      CREATE TABLE producto_variante_stock (
        variante_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        sucursal_id INTEGER NOT NULL,
        empresa_id INTEGER NOT NULL,
        stock NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock >= 0),
        stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (variante_id, sucursal_id),
        CONSTRAINT fk_variante_stock_variante
          FOREIGN KEY (variante_id, producto_id, empresa_id)
          REFERENCES producto_variante(id, producto_id, empresa_id) ON DELETE RESTRICT,
        CONSTRAINT fk_variante_stock_sucursal
          FOREIGN KEY (sucursal_id, empresa_id)
          REFERENCES sucursal(id, empresa_id) ON DELETE RESTRICT
      );

      INSERT INTO producto_variante_stock(variante_id, producto_id, sucursal_id, empresa_id, stock, stock_minimo)
      SELECT pv.id, pv.producto_id, s.id, pv.empresa_id, 0, 0
      FROM producto_variante pv
      JOIN sucursal s ON s.empresa_id=pv.empresa_id
      ON CONFLICT (variante_id, sucursal_id) DO NOTHING;

      ALTER TABLE inventario_lote ADD COLUMN IF NOT EXISTS variante_id INTEGER;
      ALTER TABLE movimiento_inventario ADD COLUMN IF NOT EXISTS variante_id INTEGER;
      ALTER TABLE movimiento_inventario ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_lote_variante_producto_empresa') THEN
          ALTER TABLE inventario_lote ADD CONSTRAINT fk_lote_variante_producto_empresa
            FOREIGN KEY (variante_id, producto_id, empresa_id)
            REFERENCES producto_variante(id, producto_id, empresa_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_movimiento_variante_producto_empresa') THEN
          ALTER TABLE movimiento_inventario ADD CONSTRAINT fk_movimiento_variante_producto_empresa
            FOREIGN KEY (variante_id, producto_id, empresa_id)
            REFERENCES producto_variante(id, producto_id, empresa_id) ON DELETE RESTRICT;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS ix_variante_stock_empresa_sucursal
        ON producto_variante_stock(empresa_id, sucursal_id, variante_id);
      CREATE INDEX IF NOT EXISTS ix_lote_variante_fefo
        ON inventario_lote(empresa_id, sucursal_id, variante_id, fecha_vencimiento, id)
        WHERE variante_id IS NOT NULL AND cantidad_disponible > 0;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_movimiento_variante_idempotency
        ON movimiento_inventario(empresa_id, usuario_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL AND variante_id IS NOT NULL;

      CREATE OR REPLACE FUNCTION crear_stock_para_variante_nueva()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO producto_variante_stock(variante_id, producto_id, sucursal_id, empresa_id, stock, stock_minimo)
        SELECT NEW.id, NEW.producto_id, s.id, NEW.empresa_id, 0, 0
        FROM sucursal s WHERE s.empresa_id=NEW.empresa_id
        ON CONFLICT(variante_id,sucursal_id) DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION crear_stock_para_sucursal_nueva_variantes()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO producto_variante_stock(variante_id, producto_id, sucursal_id, empresa_id, stock, stock_minimo)
        SELECT pv.id, pv.producto_id, NEW.id, NEW.empresa_id, 0, 0
        FROM producto_variante pv WHERE pv.empresa_id=NEW.empresa_id
        ON CONFLICT(variante_id,sucursal_id) DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_variante_stock_nueva
        AFTER INSERT ON producto_variante
        FOR EACH ROW EXECUTE FUNCTION crear_stock_para_variante_nueva();

      CREATE TRIGGER trg_sucursal_stock_nueva_variantes
        AFTER INSERT ON sucursal
        FOR EACH ROW EXECUTE FUNCTION crear_stock_para_sucursal_nueva_variantes();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query('SELECT COUNT(*)::int AS total FROM producto_variante_stock WHERE stock <> 0');
    const lots = await q.query('SELECT COUNT(*)::int AS total FROM inventario_lote WHERE variante_id IS NOT NULL');
    const movements = await q.query('SELECT COUNT(*)::int AS total FROM movimiento_inventario WHERE variante_id IS NOT NULL');
    if (Number(rows?.[0]?.total || 0) || Number(lots?.[0]?.total || 0) || Number(movements?.[0]?.total || 0)) {
      throw new Error('No se puede revertir: existen saldos, lotes o movimientos de variantes. Se requiere respaldo y procedimiento de reversión aprobado.');
    }
    await q.query(`
      DROP TRIGGER IF EXISTS trg_variante_stock_nueva ON producto_variante;
      DROP TRIGGER IF EXISTS trg_sucursal_stock_nueva_variantes ON sucursal;
      DROP FUNCTION IF EXISTS crear_stock_para_variante_nueva();
      DROP FUNCTION IF EXISTS crear_stock_para_sucursal_nueva_variantes();
      DROP INDEX IF EXISTS uq_movimiento_variante_idempotency;
      DROP INDEX IF EXISTS ix_lote_variante_fefo;
      DROP INDEX IF EXISTS ix_variante_stock_empresa_sucursal;
      ALTER TABLE movimiento_inventario DROP CONSTRAINT IF EXISTS fk_movimiento_variante_producto_empresa;
      ALTER TABLE inventario_lote DROP CONSTRAINT IF EXISTS fk_lote_variante_producto_empresa;
      ALTER TABLE movimiento_inventario DROP COLUMN IF EXISTS idempotency_key;
      ALTER TABLE movimiento_inventario DROP COLUMN IF EXISTS variante_id;
      ALTER TABLE inventario_lote DROP COLUMN IF EXISTS variante_id;
      DROP TABLE IF EXISTS producto_variante_stock;
      DROP INDEX IF EXISTS uq_producto_variante_id_producto_empresa;
    `);
  }
}
