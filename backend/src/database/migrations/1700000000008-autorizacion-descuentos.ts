import { MigrationInterface, QueryRunner } from 'typeorm';

/** Registra el motivo requerido para los descuentos autorizados por administración. */
export class AutorizacionDescuentos1700000000008 implements MigrationInterface {
  name='AutorizacionDescuentos1700000000008';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`ALTER TABLE comprobante ADD COLUMN IF NOT EXISTS motivo_descuento VARCHAR(250)`);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM comprobante WHERE motivo_descuento IS NOT NULL) THEN RAISE EXCEPTION 'No se puede revertir: existen motivos de descuento auditados en comprobantes.'; END IF; END $$;`);
    await q.query(`ALTER TABLE comprobante DROP COLUMN IF EXISTS motivo_descuento`);
  }
}
