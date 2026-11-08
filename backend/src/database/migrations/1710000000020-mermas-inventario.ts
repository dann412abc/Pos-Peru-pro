import { MigrationInterface, QueryRunner } from 'typeorm';

/** Registro auditable de mermas y bajas de inventario por lote. */
export class MermasInventario1710000000020 implements MigrationInterface {
  name = 'MermasInventario1710000000020';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE inventario_merma (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        sucursal_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        variante_id INTEGER,
        lote_id BIGINT NOT NULL REFERENCES inventario_lote(id) ON DELETE RESTRICT,
        movimiento_id INTEGER NOT NULL REFERENCES movimiento_inventario(id) ON DELETE RESTRICT,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        motivo_tipo VARCHAR(20) NOT NULL CHECK (motivo_tipo IN ('VENCIDO','DANADO','PERDIDA','CONTAMINACION','OTRO')),
        observacion VARCHAR(500) NOT NULL,
        cantidad NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
        costo_unitario NUMERIC(12,4) NOT NULL CHECK (costo_unitario >= 0),
        costo_total NUMERIC(12,2) NOT NULL CHECK (costo_total >= 0),
        idempotency_key UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY (sucursal_id,empresa_id) REFERENCES sucursal(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY (producto_id,empresa_id) REFERENCES producto(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY (variante_id,producto_id,empresa_id) REFERENCES producto_variante(id,producto_id,empresa_id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_inventario_merma_idempotency
        ON inventario_merma(empresa_id,usuario_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX ix_inventario_merma_sucursal_fecha
        ON inventario_merma(empresa_id,sucursal_id,created_at DESC);
      CREATE INDEX ix_inventario_merma_lote ON inventario_merma(lote_id,created_at DESC);
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query('SELECT COUNT(*)::int AS total FROM inventario_merma');
    if (Number(rows[0]?.total || 0) > 0) {
      throw new Error('No se puede revertir: existen mermas auditadas. Exporte y regularice los registros antes.');
    }
    await q.query('DROP TABLE IF EXISTS inventario_merma');
  }
}
