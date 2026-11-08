import { MigrationInterface, QueryRunner } from 'typeorm';

/** Bandeja persistente de alertas operativas, individual por administrador. */
export class AlertasOperativasPersistentes1710000000022 implements MigrationInterface {
  name = 'AlertasOperativasPersistentes1710000000022';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE alerta_operativa (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
        sucursal_id INTEGER REFERENCES sucursal(id) ON DELETE CASCADE,
        clave VARCHAR(160) NOT NULL,
        nivel VARCHAR(16) NOT NULL CHECK (nivel IN ('critica','advertencia','info')),
        categoria VARCHAR(60) NOT NULL,
        titulo VARCHAR(220) NOT NULL,
        detalle VARCHAR(1200) NOT NULL,
        destino VARCHAR(160) NOT NULL,
        activa BOOLEAN NOT NULL DEFAULT TRUE,
        leida BOOLEAN NOT NULL DEFAULT FALSE,
        leida_at TIMESTAMPTZ,
        creada_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actualizada_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ultima_deteccion_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_alerta_operativa_usuario_clave UNIQUE (empresa_id,usuario_id,clave)
      );
      CREATE INDEX ix_alerta_operativa_usuario_estado_fecha
        ON alerta_operativa(empresa_id,usuario_id,activa,leida,actualizada_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS alerta_operativa;');
  }
}
