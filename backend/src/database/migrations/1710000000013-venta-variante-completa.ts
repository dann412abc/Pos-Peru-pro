import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Une las variantes al ciclo completo de comprobantes: venta, lotes, anulación y devolución.
 * Los campos son nullable para conservar todas las ventas históricas como producto base.
 */
export class VentaVarianteCompleta1710000000013 implements MigrationInterface {
  name = 'VentaVarianteCompleta1710000000013';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE producto_variante_stock
        ADD COLUMN IF NOT EXISTS costo_promedio NUMERIC(12,4) NOT NULL DEFAULT 0
        CHECK (costo_promedio >= 0);

      ALTER TABLE comprobante_linea
        ADD COLUMN IF NOT EXISTS empresa_id INTEGER,
        ADD COLUMN IF NOT EXISTS variante_id INTEGER,
        ADD COLUMN IF NOT EXISTS variante_nombre VARCHAR(120),
        ADD COLUMN IF NOT EXISTS variante_codigo VARCHAR(60);

      UPDATE comprobante_linea cl SET empresa_id=c.empresa_id
        FROM comprobante c WHERE c.id=cl.comprobante_id AND cl.empresa_id IS NULL;
      ALTER TABLE comprobante_linea ALTER COLUMN empresa_id SET NOT NULL;

      CREATE OR REPLACE FUNCTION asignar_empresa_comprobante_linea()
      RETURNS TRIGGER AS $$
      BEGIN
        SELECT c.empresa_id INTO NEW.empresa_id
        FROM comprobante c WHERE c.id=NEW.comprobante_id;
        IF NEW.empresa_id IS NULL THEN
          RAISE EXCEPTION 'No se pudo resolver empresa_id del comprobante de la línea';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_comprobante_linea_empresa ON comprobante_linea;
      CREATE TRIGGER trg_comprobante_linea_empresa
        BEFORE INSERT OR UPDATE OF comprobante_id ON comprobante_linea
        FOR EACH ROW EXECUTE FUNCTION asignar_empresa_comprobante_linea();

      ALTER TABLE comprobante_lote_salida
        ADD COLUMN IF NOT EXISTS variante_id INTEGER;

      ALTER TABLE devolucion_venta_linea
        ADD COLUMN IF NOT EXISTS variante_id INTEGER;

      CREATE TABLE IF NOT EXISTS devolucion_venta_lote (
        id BIGSERIAL PRIMARY KEY,
        devolucion_linea_id BIGINT NOT NULL REFERENCES devolucion_venta_linea(id) ON DELETE RESTRICT,
        lote_id BIGINT NOT NULL REFERENCES inventario_lote(id) ON DELETE RESTRICT,
        cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_devolucion_venta_lote_linea ON devolucion_venta_lote(devolucion_linea_id);
      CREATE INDEX IF NOT EXISTS ix_devolucion_venta_lote_lote ON devolucion_venta_lote(lote_id);

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_comprobante_linea_variante_producto_empresa') THEN
          ALTER TABLE comprobante_linea ADD CONSTRAINT fk_comprobante_linea_variante_producto_empresa
            FOREIGN KEY (variante_id, producto_id, empresa_id)
            REFERENCES producto_variante(id, producto_id, empresa_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_lote_salida_variante_producto_empresa') THEN
          ALTER TABLE comprobante_lote_salida ADD CONSTRAINT fk_lote_salida_variante_producto_empresa
            FOREIGN KEY (variante_id, producto_id, empresa_id)
            REFERENCES producto_variante(id, producto_id, empresa_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_devolucion_linea_variante_producto_empresa') THEN
          ALTER TABLE devolucion_venta_linea ADD CONSTRAINT fk_devolucion_linea_variante_producto_empresa
            FOREIGN KEY (variante_id, producto_id, empresa_id)
            REFERENCES producto_variante(id, producto_id, empresa_id) ON DELETE RESTRICT;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS ix_comprobante_linea_variante ON comprobante_linea(empresa_id,variante_id) WHERE variante_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_lote_salida_variante ON comprobante_lote_salida(empresa_id,comprobante_id,variante_id) WHERE variante_id IS NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    const sales = await q.query('SELECT COUNT(*)::int AS total FROM comprobante_linea WHERE variante_id IS NOT NULL');
    const returns = await q.query('SELECT COUNT(*)::int AS total FROM devolucion_venta_linea WHERE variante_id IS NOT NULL');
    const lotReturns = await q.query('SELECT COUNT(*)::int AS total FROM devolucion_venta_lote');
    if (Number(sales?.[0]?.total || 0) || Number(returns?.[0]?.total || 0) || Number(lotReturns?.[0]?.total || 0)) {
      throw new Error('No se puede revertir: existen comprobantes o devoluciones con variantes.');
    }
    await q.query(`
      DROP TABLE IF EXISTS devolucion_venta_lote;
      DROP TRIGGER IF EXISTS trg_comprobante_linea_empresa ON comprobante_linea;
      DROP FUNCTION IF EXISTS asignar_empresa_comprobante_linea();
      ALTER TABLE devolucion_venta_linea DROP CONSTRAINT IF EXISTS fk_devolucion_linea_variante_producto_empresa;
      ALTER TABLE comprobante_lote_salida DROP CONSTRAINT IF EXISTS fk_lote_salida_variante_producto_empresa;
      ALTER TABLE comprobante_linea DROP CONSTRAINT IF EXISTS fk_comprobante_linea_variante_producto_empresa;
      DROP INDEX IF EXISTS ix_lote_salida_variante;
      DROP INDEX IF EXISTS ix_comprobante_linea_variante;
      ALTER TABLE comprobante_lote_salida DROP COLUMN IF EXISTS variante_id;
      ALTER TABLE comprobante_linea DROP COLUMN IF EXISTS variante_codigo;
      ALTER TABLE comprobante_linea DROP COLUMN IF EXISTS variante_nombre;
      ALTER TABLE comprobante_linea DROP COLUMN IF EXISTS variante_id;
      ALTER TABLE comprobante_linea DROP COLUMN IF EXISTS empresa_id;
      ALTER TABLE producto_variante_stock DROP COLUMN IF EXISTS costo_promedio;
    `);
  }
}
