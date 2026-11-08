import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Define si el producto se vende como unidad única o como familia de variantes.
 * Los productos existentes quedan en modo único (FALSE) para conservar compatibilidad.
 */
export class ProductoModoVariantesCodigoBarras1710000000014 implements MigrationInterface {
  name = 'ProductoModoVariantesCodigoBarras1710000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE producto
        ADD COLUMN IF NOT EXISTS tiene_variantes BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(80)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_empresa_codigo_barras
      ON producto(empresa_id, codigo_barras)
      WHERE codigo_barras IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS uq_producto_empresa_codigo_barras');
    await queryRunner.query(`
      ALTER TABLE producto
        DROP COLUMN IF EXISTS codigo_barras,
        DROP COLUMN IF EXISTS tiene_variantes
    `);
  }
}
