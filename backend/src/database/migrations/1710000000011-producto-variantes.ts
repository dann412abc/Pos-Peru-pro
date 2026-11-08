import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo de variantes por producto. No toca stock ni ventas existentes.
 * El inventario por variante se habilitará en una etapa posterior, después de adaptar
 * las operaciones transaccionales de venta y movimientos de almacén.
 */
export class ProductoVariantes1710000000011 implements MigrationInterface {
  name = 'ProductoVariantes1710000000011';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- El id de producto ya es PK; este índice hace explícita la clave compuesta
      -- requerida por la FK que también verifica la pertenencia a empresa.
      CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_id_empresa
        ON producto(id, empresa_id);

      CREATE TABLE IF NOT EXISTS producto_variante (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id),
        producto_id INTEGER NOT NULL,
        codigo VARCHAR(60) NOT NULL,
        codigo_barras VARCHAR(80),
        nombre VARCHAR(120) NOT NULL,
        precio NUMERIC(12,2) NOT NULL CHECK (precio > 0),
        precio_mayoreo NUMERIC(12,2) CHECK (precio_mayoreo IS NULL OR precio_mayoreo > 0),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_producto_variante_producto
          FOREIGN KEY (producto_id, empresa_id)
          REFERENCES producto(id, empresa_id) ON DELETE RESTRICT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_variante_codigo
        ON producto_variante(empresa_id, codigo);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_variante_barras
        ON producto_variante(empresa_id, codigo_barras)
        WHERE codigo_barras IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_producto_variante_producto_activo
        ON producto_variante(empresa_id, producto_id, activo);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query('SELECT COUNT(*)::int AS total FROM producto_variante');
    if (Number(rows?.[0]?.total || 0) > 0) {
      throw new Error('No se puede revertir: existen variantes registradas. Exporte y elimine los datos mediante un procedimiento aprobado.');
    }
    await queryRunner.query(`
      DROP TABLE IF EXISTS producto_variante;
      DROP INDEX IF EXISTS uq_producto_id_empresa;
    `);
  }
}
