import { MigrationInterface, QueryRunner } from 'typeorm';

/** Vincula notas electrónicas a su comprobante de origen y registra su motivo. */
export class NotasCreditoDebito1700000000009 implements MigrationInterface {
  name = 'NotasCreditoDebito1700000000009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE comprobante
        ADD COLUMN IF NOT EXISTS referencia_comprobante_id INTEGER,
        ADD COLUMN IF NOT EXISTS devolucion_venta_id BIGINT,
        ADD COLUMN IF NOT EXISTS codigo_motivo_nota VARCHAR(2),
        ADD COLUMN IF NOT EXISTS descripcion_motivo_nota VARCHAR(250),
        ADD COLUMN IF NOT EXISTS request_hash VARCHAR(64);

      INSERT INTO serie_correlativo(sucursal_id,tipo_comprobante,serie,ultimo_correlativo)
        SELECT id,'07','NC01',0 FROM sucursal
        ON CONFLICT (sucursal_id,tipo_comprobante,serie) DO NOTHING;
      INSERT INTO serie_correlativo(sucursal_id,tipo_comprobante,serie,ultimo_correlativo)
        SELECT id,'08','ND01',0 FROM sucursal
        ON CONFLICT (sucursal_id,tipo_comprobante,serie) DO NOTHING;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_comprobante_nota_referencia_empresa') THEN
          ALTER TABLE comprobante ADD CONSTRAINT fk_comprobante_nota_referencia_empresa
            FOREIGN KEY (referencia_comprobante_id, empresa_id)
            REFERENCES comprobante(id, empresa_id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_comprobante_nota_devolucion_empresa') THEN
          ALTER TABLE comprobante ADD CONSTRAINT fk_comprobante_nota_devolucion_empresa
            FOREIGN KEY (devolucion_venta_id, sucursal_id, empresa_id)
            REFERENCES devolucion_venta(id, sucursal_id, empresa_id) ON DELETE RESTRICT;
        END IF;
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_nota_credito_por_devolucion
        ON comprobante(empresa_id, devolucion_venta_id)
        WHERE tipo='07' AND devolucion_venta_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_comprobante_notas_referencia
        ON comprobante(empresa_id, sucursal_id, referencia_comprobante_id)
        WHERE referencia_comprobante_id IS NOT NULL;
      ALTER TABLE comprobante ADD CONSTRAINT ck_comprobante_nota_referencia CHECK (
        (tipo IN ('01','03') AND referencia_comprobante_id IS NULL AND devolucion_venta_id IS NULL
          AND codigo_motivo_nota IS NULL AND descripcion_motivo_nota IS NULL)
        OR (tipo='07' AND referencia_comprobante_id IS NOT NULL AND devolucion_venta_id IS NOT NULL
          AND codigo_motivo_nota IN ('06','07') AND descripcion_motivo_nota IS NOT NULL)
        OR (tipo='08' AND referencia_comprobante_id IS NOT NULL AND devolucion_venta_id IS NULL
          AND codigo_motivo_nota='02' AND descripcion_motivo_nota IS NOT NULL)
      ) NOT VALID;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const notas = await queryRunner.query(`SELECT COUNT(*)::int AS cantidad FROM comprobante WHERE tipo IN ('07','08') AND referencia_comprobante_id IS NOT NULL`);
    if (Number(notas?.[0]?.cantidad || 0) > 0) {
      throw new Error('No se puede revertir: existen notas de crédito/débito vinculadas. Archive la base para conservar el historial.');
    }
    await queryRunner.query(`
      ALTER TABLE comprobante DROP CONSTRAINT IF EXISTS ck_comprobante_nota_referencia;
      DROP INDEX IF EXISTS idx_comprobante_notas_referencia;
      DROP INDEX IF EXISTS uq_nota_credito_por_devolucion;
      ALTER TABLE comprobante DROP CONSTRAINT IF EXISTS fk_comprobante_nota_devolucion_empresa;
      ALTER TABLE comprobante DROP CONSTRAINT IF EXISTS fk_comprobante_nota_referencia_empresa;
      ALTER TABLE comprobante DROP COLUMN IF EXISTS request_hash;
      ALTER TABLE comprobante DROP COLUMN IF EXISTS descripcion_motivo_nota;
      ALTER TABLE comprobante DROP COLUMN IF EXISTS codigo_motivo_nota;
      ALTER TABLE comprobante DROP COLUMN IF EXISTS devolucion_venta_id;
      ALTER TABLE comprobante DROP COLUMN IF EXISTS referencia_comprobante_id;
    `);
  }
}
