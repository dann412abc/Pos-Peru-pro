import { MigrationInterface, QueryRunner } from 'typeorm';

/** Sesiones de inventario físico, cantidades contadas y diferencias aplicadas. */
export class ConteoFisicoInventario1710000000021 implements MigrationInterface {
  name = 'ConteoFisicoInventario1710000000021';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE inventario_conteo (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        sucursal_id INTEGER NOT NULL,
        usuario_apertura_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
        usuario_cierre_id INTEGER REFERENCES usuario(id) ON DELETE RESTRICT,
        estado VARCHAR(12) NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO','CERRADO','CANCELADO')),
        observacion VARCHAR(200) NOT NULL,
        total_lineas INTEGER NOT NULL DEFAULT 0,
        lineas_contadas INTEGER NOT NULL DEFAULT 0,
        diferencia_unidades NUMERIC(14,3) NOT NULL DEFAULT 0,
        costo_diferencia NUMERIC(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        FOREIGN KEY (sucursal_id,empresa_id) REFERENCES sucursal(id,empresa_id) ON DELETE RESTRICT
      );
      CREATE INDEX ix_inventario_conteo_empresa_sucursal_fecha
        ON inventario_conteo(empresa_id,sucursal_id,created_at DESC);
      CREATE UNIQUE INDEX uq_inventario_conteo_abierto_sucursal
        ON inventario_conteo(empresa_id,sucursal_id) WHERE estado='ABIERTO';

      CREATE TABLE inventario_conteo_linea (
        id BIGSERIAL PRIMARY KEY,
        conteo_id BIGINT NOT NULL REFERENCES inventario_conteo(id) ON DELETE RESTRICT,
        empresa_id INTEGER NOT NULL,
        sucursal_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        variante_id INTEGER,
        codigo VARCHAR(80),
        producto_nombre VARCHAR(200) NOT NULL,
        variante_nombre VARCHAR(120),
        stock_sistema NUMERIC(12,3) NOT NULL CHECK (stock_sistema >= 0),
        cantidad_contada NUMERIC(12,3) CHECK (cantidad_contada >= 0),
        diferencia NUMERIC(12,3),
        costo_unitario NUMERIC(12,4) NOT NULL DEFAULT 0,
        costo_diferencia NUMERIC(14,2),
        movimiento_id INTEGER REFERENCES movimiento_inventario(id) ON DELETE RESTRICT,
        contado_at TIMESTAMPTZ,
        FOREIGN KEY (sucursal_id,empresa_id) REFERENCES sucursal(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY (producto_id,empresa_id) REFERENCES producto(id,empresa_id) ON DELETE RESTRICT,
        FOREIGN KEY (variante_id,producto_id,empresa_id) REFERENCES producto_variante(id,producto_id,empresa_id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX uq_inventario_conteo_linea_sku ON inventario_conteo_linea(conteo_id,producto_id,COALESCE(variante_id,0));
      CREATE INDEX ix_inventario_conteo_linea_conteo ON inventario_conteo_linea(conteo_id,id);
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query(`SELECT COUNT(*)::int AS total FROM inventario_conteo WHERE estado='CERRADO'`);
    if (Number(rows[0]?.total || 0) > 0) throw new Error('No se puede revertir: existen inventarios físicos cerrados con ajustes aplicados.');
    await q.query('DROP TABLE IF EXISTS inventario_conteo_linea; DROP TABLE IF EXISTS inventario_conteo;');
  }
}
