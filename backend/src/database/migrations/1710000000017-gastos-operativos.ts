import { MigrationInterface, QueryRunner } from 'typeorm';

/** Etapa 23: gastos operativos, vencimientos y pagos. No ejecutar sin autorización. */
export class GastosOperativos1710000000017 implements MigrationInterface {
  name = 'GastosOperativos1710000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE gasto_operativo (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL REFERENCES sucursal(id) ON DELETE RESTRICT,
        usuario_ref VARCHAR(120) NOT NULL,
        categoria VARCHAR(24) NOT NULL CHECK (categoria IN
          ('ALQUILER','SERVICIOS','PERSONAL','TRANSPORTE','MANTENIMIENTO','SUMINISTROS','IMPUESTOS','OTROS')),
        descripcion VARCHAR(240) NOT NULL,
        monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
        metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN
          ('EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA')),
        fecha DATE NOT NULL,
        fecha_vencimiento DATE,
        estado VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PAGADO')),
        metodo_pago_real VARCHAR(20) CHECK (metodo_pago_real IN
          ('EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA')),
        referencia_pago VARCHAR(100),
        fecha_pago DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (fecha_vencimiento IS NULL OR fecha_vencimiento >= fecha),
        CHECK (
          (estado = 'PENDIENTE' AND fecha_pago IS NULL AND metodo_pago_real IS NULL)
          OR
          (estado = 'PAGADO' AND fecha_pago IS NOT NULL AND metodo_pago_real IS NOT NULL)
        )
      );
      CREATE INDEX idx_gasto_operativo_empresa_sucursal_fecha
        ON gasto_operativo(empresa_id,sucursal_id,fecha DESC);
      CREATE INDEX idx_gasto_operativo_pendientes
        ON gasto_operativo(empresa_id,sucursal_id,fecha_vencimiento)
        WHERE estado='PENDIENTE';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS gasto_operativo;');
  }
}
