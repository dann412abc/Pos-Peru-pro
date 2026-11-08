import { MigrationInterface, QueryRunner } from 'typeorm';

/** Evita confundir una aceptación del adaptador local con una respuesta de SUNAT/OSE. */
export class MarcaComprobantesSimulados1710000000023 implements MigrationInterface {
  name = 'MarcaComprobantesSimulados1710000000023';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE comprobante_electronico ADD COLUMN IF NOT EXISTS es_simulacion BOOLEAN NOT NULL DEFAULT FALSE;`);
    // El adaptador anterior era explícitamente MOCK; no se puede considerar recepción tributaria real.
    await q.query(`UPDATE comprobante_electronico SET es_simulacion=TRUE WHERE estado_actual='ACEPTADO' AND hash_cdr IS NOT NULL;`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE comprobante_electronico DROP COLUMN IF EXISTS es_simulacion;`);
  }
}
