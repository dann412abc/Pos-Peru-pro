import { MigrationInterface, QueryRunner } from 'typeorm';

/** Etapa 21: vencimientos y antigüedad de saldos de proveedores. */
export class CuentasPorPagarVencimientos1710000000016 implements MigrationInterface {
  name = 'CuentasPorPagarVencimientos1710000000016';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE compra ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;
      UPDATE compra SET fecha_vencimiento = fecha_documento
       WHERE condicion_pago = 'CREDITO' AND fecha_vencimiento IS NULL;
      CREATE INDEX IF NOT EXISTS idx_compra_vencimientos_pendientes
        ON compra(empresa_id, sucursal_id, fecha_vencimiento)
        WHERE estado = 'RECIBIDA' AND saldo_pendiente > 0;
      COMMENT ON COLUMN compra.fecha_vencimiento IS
        'Fecha pactada de pago al proveedor; NULL para compras al contado.';
    `);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_compra_vencimientos_pendientes; ALTER TABLE compra DROP COLUMN IF EXISTS fecha_vencimiento;`);
  }
}
