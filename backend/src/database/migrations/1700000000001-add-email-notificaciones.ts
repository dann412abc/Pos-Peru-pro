import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 002: email de cliente + tabla de log de envios de notificacion
 * (email / WhatsApp).
 */
export class AddEmailNotificaciones1700000000001 implements MigrationInterface {
  name = 'AddEmailNotificaciones1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS email VARCHAR(200);`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS envios_notificacion (
        id SERIAL PRIMARY KEY,
        comprobante_id INTEGER NOT NULL REFERENCES comprobante(id) ON DELETE CASCADE,
        canal VARCHAR(10) NOT NULL CHECK (canal IN ('EMAIL','WHATSAPP')),
        destino VARCHAR(200) NOT NULL,
        estado VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE'
          CHECK (estado IN ('PENDIENTE','ENVIADO','FALLIDO')),
        mensaje_error TEXT,
        simulado BOOLEAN NOT NULL DEFAULT FALSE,
        fecha_envio TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_envios_notif_comprobante ON envios_notificacion (comprobante_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS envios_notificacion;`);
    await queryRunner.query(`ALTER TABLE cliente DROP COLUMN IF EXISTS email;`);
  }
}
