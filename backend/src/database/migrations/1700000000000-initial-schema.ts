import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial de Mi Carrito POS.
 * Columnas en snake_case. Todas las FK declaradas (sin relaciones rotas).
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE empresa (
        id SERIAL PRIMARY KEY,
        ruc VARCHAR(11) NOT NULL UNIQUE,
        razon_social VARCHAR(200) NOT NULL,
        nombre_comercial VARCHAR(200),
        direccion VARCHAR(300) NOT NULL,
        ubigeo VARCHAR(6) NOT NULL,
        departamento VARCHAR(100) NOT NULL,
        provincia VARCHAR(100) NOT NULL,
        distrito VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE sucursal (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        nombre VARCHAR(200) NOT NULL,
        direccion VARCHAR(300) NOT NULL,
        ubigeo VARCHAR(6) NOT NULL,
        departamento VARCHAR(100) NOT NULL,
        provincia VARCHAR(100) NOT NULL,
        distrito VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE usuario (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(100) NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        rol VARCHAR(10) NOT NULL CHECK (rol IN ('ADMIN','CAJERO')),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE usuario_sucursal (
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL REFERENCES sucursal(id) ON DELETE CASCADE,
        PRIMARY KEY (usuario_id, sucursal_id)
      );

      CREATE TABLE categoria (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        nombre VARCHAR(100) NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE producto (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        codigo VARCHAR(30) NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        categoria_id INTEGER REFERENCES categoria(id) ON DELETE SET NULL,
        unidad VARCHAR(3) NOT NULL DEFAULT 'NIU',
        precio NUMERIC(12,2) NOT NULL,
        precio_mayoreo NUMERIC(12,2),
        stock NUMERIC(12,3) NOT NULL DEFAULT 0,
        stock_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
        tipo_igv INTEGER NOT NULL DEFAULT 10 CHECK (tipo_igv IN (10,20,30)),
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id, codigo)
      );

      CREATE TABLE cliente (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        tipo_doc VARCHAR(3) NOT NULL CHECK (tipo_doc IN ('DNI','RUC')),
        numero VARCHAR(11) NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        direccion VARCHAR(300),
        telefono VARCHAR(20),
        limite_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
        saldo_credito NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (empresa_id, tipo_doc, numero)
      );

      CREATE TABLE serie_correlativo (
        id SERIAL PRIMARY KEY,
        sucursal_id INTEGER NOT NULL REFERENCES sucursal(id) ON DELETE CASCADE,
        tipo_comprobante VARCHAR(2) NOT NULL CHECK (tipo_comprobante IN ('01','03','07','08')),
        serie VARCHAR(4) NOT NULL,
        ultimo_correlativo INTEGER NOT NULL DEFAULT 0,
        UNIQUE (sucursal_id, tipo_comprobante, serie)
      );

      CREATE TABLE caja (
        id SERIAL PRIMARY KEY,
        sucursal_id INTEGER NOT NULL REFERENCES sucursal(id) ON DELETE CASCADE,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
        saldo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
        fecha_apertura TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        fecha_cierre TIMESTAMPTZ,
        estado VARCHAR(10) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','CERRADA')),
        efectivo_contado NUMERIC(12,2),
        diferencia NUMERIC(12,2),
        arqueo JSONB
      );

      -- Solo una caja ABIERTA por sucursal+usuario.
      CREATE UNIQUE INDEX uq_caja_abierta_sucursal_usuario
        ON caja (sucursal_id, usuario_id) WHERE estado = 'ABIERTA';

      CREATE TABLE comprobante (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        sucursal_id INTEGER NOT NULL REFERENCES sucursal(id) ON DELETE CASCADE,
        caja_id INTEGER REFERENCES caja(id) ON DELETE SET NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
        cliente_id INTEGER NOT NULL REFERENCES cliente(id) ON DELETE RESTRICT,
        tipo VARCHAR(2) NOT NULL CHECK (tipo IN ('01','03','07','08')),
        serie VARCHAR(4) NOT NULL,
        correlativo INTEGER NOT NULL,
        fecha_emision TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        op_gravadas NUMERIC(12,2) NOT NULL DEFAULT 0,
        op_exoneradas NUMERIC(12,2) NOT NULL DEFAULT 0,
        op_inafectas NUMERIC(12,2) NOT NULL DEFAULT 0,
        descuento_global NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_igv NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        metodo_pago VARCHAR(10) NOT NULL CHECK (metodo_pago IN ('EFECTIVO','TARJETA','YAPE','PLIN','CREDITO')),
        monto_recibido NUMERIC(12,2),
        vuelto NUMERIC(12,2),
        estado VARCHAR(10) NOT NULL DEFAULT 'PAGADA' CHECK (estado IN ('PENDIENTE','PAGADA','ANULADA')),
        UNIQUE (sucursal_id, tipo, serie, correlativo)
      );
      CREATE INDEX idx_comprobante_sucursal_fecha ON comprobante (sucursal_id, fecha_emision);

      CREATE TABLE comprobante_linea (
        id SERIAL PRIMARY KEY,
        comprobante_id INTEGER NOT NULL REFERENCES comprobante(id) ON DELETE CASCADE,
        numero_linea INTEGER NOT NULL,
        producto_id INTEGER NOT NULL REFERENCES producto(id) ON DELETE RESTRICT,
        cantidad NUMERIC(12,3) NOT NULL,
        precio_unitario NUMERIC(12,2) NOT NULL,
        descuento NUMERIC(12,2) NOT NULL DEFAULT 0,
        tipo_igv INTEGER NOT NULL CHECK (tipo_igv IN (10,20,30)),
        base_imponible NUMERIC(12,2) NOT NULL DEFAULT 0,
        igv NUMERIC(12,2) NOT NULL DEFAULT 0,
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_comprobante_linea_comprobante ON comprobante_linea (comprobante_id);

      CREATE TABLE comprobante_electronico (
        id SERIAL PRIMARY KEY,
        comprobante_id INTEGER NOT NULL UNIQUE REFERENCES comprobante(id) ON DELETE CASCADE,
        estado_actual VARCHAR(20) NOT NULL DEFAULT 'CREADO'
          CHECK (estado_actual IN ('CREADO','FIRMADO','ENVIADO','ACEPTADO','RECHAZADO')),
        xml_ubl_path VARCHAR(500),
        hash_cdr VARCHAR(100),
        nombre_archivo_cdr VARCHAR(200),
        intentos_envio INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE fe_evento (
        id SERIAL PRIMARY KEY,
        comprobante_electronico_id INTEGER NOT NULL REFERENCES comprobante_electronico(id) ON DELETE CASCADE,
        estado VARCHAR(20) NOT NULL CHECK (estado IN ('CREADO','FIRMADO','ENVIADO','ACEPTADO','RECHAZADO')),
        observaciones TEXT,
        hash_cdr VARCHAR(100),
        nombre_archivo_cdr VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_fe_evento_comprobante ON fe_evento (comprobante_electronico_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fe_evento;`);
    await queryRunner.query(`DROP TABLE IF EXISTS comprobante_electronico;`);
    await queryRunner.query(`DROP TABLE IF EXISTS comprobante_linea;`);
    await queryRunner.query(`DROP TABLE IF EXISTS comprobante;`);
    await queryRunner.query(`DROP TABLE IF EXISTS caja;`);
    await queryRunner.query(`DROP TABLE IF EXISTS serie_correlativo;`);
    await queryRunner.query(`DROP TABLE IF EXISTS cliente;`);
    await queryRunner.query(`DROP TABLE IF EXISTS producto;`);
    await queryRunner.query(`DROP TABLE IF EXISTS categoria;`);
    await queryRunner.query(`DROP TABLE IF EXISTS usuario_sucursal;`);
    await queryRunner.query(`DROP TABLE IF EXISTS usuario;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sucursal;`);
    await queryRunner.query(`DROP TABLE IF EXISTS empresa;`);
  }
}
