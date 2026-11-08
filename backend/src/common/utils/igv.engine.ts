import { IGV_PORCENTAJE, TipoIgvEnum } from '../enums';
import { redondear2 } from './round.util';

/**
 * Motor de calculo de IGV para Mi Carrito POS.
 *
 * Reglas de negocio (Peru, IGV 18%):
 *  - El precio de producto INCLUYE IGV.
 *  - Gravado (10): base_imponible = (precio_unitario * cantidad - descuento) / 1.18
 *                  igv = base_imponible * 0.18
 *  - Exonerado (20) e inafecto (30): NO suman IGV => base_imponible = importe, igv = 0.
 *  - El descuento por linea se resta ANTES de calcular el IGV.
 *  - Redondeo a 2 decimales en CADA linea y en los totales.
 */

export interface LineaIgvInput {
  cantidad: number;
  /** Precio unitario INCLUYE IGV. */
  precioUnitario: number;
  /** Descuento en monto (soles) para esta linea. Se resta antes del IGV. */
  descuento?: number;
  tipoIgv: TipoIgvEnum;
}

export interface LineaIgvResultado {
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  tipoIgv: TipoIgvEnum;
  /** Importe bruto = precioUnitario * cantidad (sin redondear en el calculo intermedio). */
  importeBruto: number;
  baseImponible: number;
  igv: number;
  /** subtotal = baseImponible + igv (debe coincidir con importeBruto - descuento redondeado). */
  subtotal: number;
}

export interface TotalesComprobante {
  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  descuentoGlobal: number;
  totalIgv: number;
  total: number;
}

export function calcularLinea(input: LineaIgvInput): LineaIgvResultado {
  const cantidad = Number(input.cantidad) || 0;
  const precioUnitario = Number(input.precioUnitario) || 0;
  const descuento = redondear2(Number(input.descuento) || 0);
  const importeBruto = redondear2(precioUnitario * cantidad);
  const baseBruta = redondear2(importeBruto - descuento);

  let baseImponible: number;
  let igv: number;

  if (input.tipoIgv === TipoIgvEnum.GRAVADO) {
    baseImponible = redondear2(baseBruta / (1 + IGV_PORCENTAJE));
    igv = redondear2(baseImponible * IGV_PORCENTAJE);
  } else {
    // Exonerado (20) o inafecto (30): no hay IGV.
    baseImponible = baseBruta;
    igv = 0;
  }

  const subtotal = redondear2(baseImponible + igv);

  return {
    cantidad,
    precioUnitario,
    descuento,
    tipoIgv: input.tipoIgv,
    importeBruto,
    baseImponible,
    igv,
    subtotal,
  };
}

export function calcularComprobante(
  lineas: LineaIgvInput[],
  descuentoGlobal = 0,
): { lineas: LineaIgvResultado[]; totales: TotalesComprobante } {
  const lineasCalculadas = lineas.map(calcularLinea);

  let opGravadas = 0;
  let opExoneradas = 0;
  let opInafectas = 0;
  let totalIgv = 0;

  for (const ln of lineasCalculadas) {
    if (ln.tipoIgv === TipoIgvEnum.GRAVADO) {
      opGravadas = redondear2(opGravadas + ln.baseImponible);
    } else if (ln.tipoIgv === TipoIgvEnum.EXONERADO) {
      opExoneradas = redondear2(opExoneradas + ln.baseImponible);
    } else {
      opInafectas = redondear2(opInafectas + ln.baseImponible);
    }
    totalIgv = redondear2(totalIgv + ln.igv);
  }

  const descuentoGlobalRed = redondear2(descuentoGlobal || 0);
  const subtotalNeto = redondear2(opGravadas + opExoneradas + opInafectas + totalIgv);
  const total = redondear2(subtotalNeto - descuentoGlobalRed);

  return {
    lineas: lineasCalculadas,
    totales: {
      opGravadas,
      opExoneradas,
      opInafectas,
      descuentoGlobal: descuentoGlobalRed,
      totalIgv,
      total,
    },
  };
}
