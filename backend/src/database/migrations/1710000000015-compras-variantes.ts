import { MigrationInterface, QueryRunner } from 'typeorm';

/** Permite recibir compras y costos promedio por presentación (variante). */
export class ComprasVariantes1710000000015 implements MigrationInterface {
  name = 'ComprasVariantes1710000000015';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE compra_linea
        ADD COLUMN IF NOT EXISTS variante_id INTEGER,
        ADD COLUMN IF NOT EXISTS variante_nombre VARCHAR(160),
        ADD COLUMN IF NOT EXISTS variante_codigo VARCHAR(80),
        ADD COLUMN IF NOT EXISTS unidad_compra VARCHAR(20) NOT NULL DEFAULT 'UNIDAD',
        ADD COLUMN IF NOT EXISTS cantidad_empaques NUMERIC(12,3) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS unidades_por_empaque NUMERIC(12,3) NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS costo_empaque NUMERIC(12,4) NOT NULL DEFAULT 0;

      UPDATE compra_linea
      SET cantidad_empaques=cantidad, unidades_por_empaque=1, costo_empaque=costo_unitario
      WHERE costo_empaque=0;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_compra_linea_empaque') THEN
          ALTER TABLE compra_linea ADD CONSTRAINT ck_compra_linea_empaque
            CHECK (cantidad_empaques > 0 AND unidades_por_empaque > 0 AND costo_empaque > 0);
        END IF;
      END $$;

      ALTER TABLE compra_linea
        DROP CONSTRAINT IF EXISTS uq_compra_linea_producto;
      ALTER TABLE devolucion_proveedor_linea
        ADD COLUMN IF NOT EXISTS variante_id INTEGER;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_compra_linea_producto_base
        ON compra_linea(compra_id, producto_id)
        WHERE variante_id IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_compra_linea_variante
        ON compra_linea(compra_id, variante_id)
        WHERE variante_id IS NOT NULL;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_compra_linea_variante_producto_empresa') THEN
          ALTER TABLE compra_linea
            ADD CONSTRAINT fk_compra_linea_variante_producto_empresa
            FOREIGN KEY (variante_id, producto_id, empresa_id)
            REFERENCES producto_variante(id, producto_id, empresa_id) ON DELETE RESTRICT;
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_devolucion_proveedor_linea_variante_empresa') THEN
          ALTER TABLE devolucion_proveedor_linea
            ADD CONSTRAINT fk_devolucion_proveedor_linea_variante_empresa
            FOREIGN KEY (variante_id, producto_id, empresa_id)
            REFERENCES producto_variante(id, producto_id, empresa_id) ON DELETE RESTRICT;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_compra_linea_variante
        ON compra_linea(empresa_id, variante_id) WHERE variante_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_devolucion_proveedor_linea_variante
        ON devolucion_proveedor_linea(empresa_id, variante_id) WHERE variante_id IS NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query('SELECT COUNT(*)::int AS total FROM compra_linea WHERE variante_id IS NOT NULL');
    if (Number(rows?.[0]?.total || 0) > 0) {
      throw new Error('No se puede revertir: existen compras recibidas con variantes. Requiere migración compensatoria y respaldo.');
    }
    await q.query(`
      DROP INDEX IF EXISTS idx_devolucion_proveedor_linea_variante;
      DROP INDEX IF EXISTS idx_compra_linea_variante;
      ALTER TABLE devolucion_proveedor_linea DROP CONSTRAINT IF EXISTS fk_devolucion_proveedor_linea_variante_empresa;
      ALTER TABLE devolucion_proveedor_linea DROP COLUMN IF EXISTS variante_id;
      ALTER TABLE compra_linea DROP CONSTRAINT IF EXISTS fk_compra_linea_variante_producto_empresa;
      DROP INDEX IF EXISTS uq_compra_linea_variante;
      DROP INDEX IF EXISTS uq_compra_linea_producto_base;
      ALTER TABLE compra_linea DROP CONSTRAINT IF EXISTS ck_compra_linea_empaque;
      ALTER TABLE compra_linea
        DROP COLUMN IF EXISTS costo_empaque,
        DROP COLUMN IF EXISTS unidades_por_empaque,
        DROP COLUMN IF EXISTS cantidad_empaques,
        DROP COLUMN IF EXISTS unidad_compra,
        DROP COLUMN IF EXISTS variante_codigo,
        DROP COLUMN IF EXISTS variante_nombre,
        DROP COLUMN IF EXISTS variante_id;
      ALTER TABLE compra_linea
        ADD CONSTRAINT uq_compra_linea_producto UNIQUE (compra_id, producto_id);
    `);
  }
}
