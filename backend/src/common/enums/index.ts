/**
 * Enumerados del dominio Mi Carrito POS (alineados a catalogos SUNAT donde aplica).
 * Se usan como strings en TypeScript y se persisten como varchar con CHECK en BD.
 */

/** Tipo de documento comprobante de pago (Catalogo SUNAT 01). */
export enum TipoComprobanteEnum {
  FACTURA = '01',
  BOLETA = '03',
  NOTA_CREDITO = '07',
  NOTA_DEBITO = '08',
}

/** Tipo de afectacion al IGV (Catalogo SUNAT 07). */
export enum TipoIgvEnum {
  GRAVADO = 10,
  EXONERADO = 20,
  INAFECTO = 30,
}

/** Tipo de documento de identidad del cliente (Catalogo SUNAT 06). */
export enum TipoDocClienteEnum {
  DNI = 'DNI',
  RUC = 'RUC',
}

/** Metodos de pago aceptados en el POS. */
export enum MetodoPagoEnum {
  EFECTIVO = 'EFECTIVO',
  TARJETA = 'TARJETA',
  YAPE = 'YAPE',
  PLIN = 'PLIN',
  CREDITO = 'CREDITO',
  MIXTO = 'MIXTO',
}

/** Estado de un comprobante de pago (venta). */
export enum EstadoComprobanteEnum {
  PENDIENTE = 'PENDIENTE',
  PAGADA = 'PAGADA',
  ANULADA = 'ANULADA',
}

/** Estado de caja. */
export enum EstadoCajaEnum {
  ABIERTA = 'ABIERTA',
  CERRADA = 'CERRADA',
}

/** Roles de usuario (RBAC). */
export enum RolUsuarioEnum {
  ADMIN = 'ADMIN',
  CAJERO = 'CAJERO',
}

/** Estados del event-sourcing de facturacion electronica. */
export enum EstadoFeEnum {
  CREADO = 'CREADO',
  FIRMADO = 'FIRMADO',
  ENVIADO = 'ENVIADO',
  ACEPTADO = 'ACEPTADO',
  RECHAZADO = 'RECHAZADO',
}

/** Unidad de medida por defecto (Catalogo SUNAT 03: NIU = unidad). */
export const UNIDAD_POR_DEFECTO = 'NIU';

/** IGV vigente en Peru (18%). */
export const IGV_PORCENTAJE = 0.18;

/** Codigo de moneda PEN (ISO 4217). */
export const MONEDA_PEN = 'PEN';

/** Codigo numerico de pais Peru (Catalogo SUNAT 04: 177 = PE). */
export const CODIGO_PAIS_PE = 'PE';
export const CODIGO_PAIS_NUMERICO_PE = '177';

/** Series por defecto segun tipo de comprobante. */
export const SERIE_POR_DEFECTO: Record<string, string> = {
  [TipoComprobanteEnum.FACTURA]: 'F001',
  [TipoComprobanteEnum.BOLETA]: 'B001',
  [TipoComprobanteEnum.NOTA_CREDITO]: 'NC01',
  [TipoComprobanteEnum.NOTA_DEBITO]: 'ND01',
};
