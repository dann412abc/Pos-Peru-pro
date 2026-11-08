// Motor de cálculo IGV de Mi Carrito POS (Perú).
// Reglas: los precios INCLUYEN IGV (18%).
//   base = precio / 1.18 ; igv = base * 0.18
//   Los ítems exonerados (tipoIgv=20) e inafectos (30) NO suman IGV.
//   Todo se redondea a 2 decimales.
import type { LineaVenta, TipoIgv } from '../types';

export const IGV_TASA = 0.18;
export const IGV_FACTOR = 1 + IGV_TASA; // 1.18

/** Redondea a 2 decimales (formato monetario PEN). */
export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Formatea un monto en soles peruanos: S/ 1,234.56 */
export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(monto);
}

export interface ResultadoLinea {
  subtotal: number; // cantidad * precioUnitario (incluye IGV)
  baseImponible: number; // sin IGV, solo si es gravado
  igv: number;
  totalLinea: number; // subtotal - descuento (incluye IGV)
}

/** Calcula base imponible e IGV de una línea de venta. */
export function calcularLinea(linea: LineaVenta): ResultadoLinea {
  const subtotal = redondear(linea.cantidad * linea.precioUnitario);
  const totalLinea = redondear(Math.max(0, subtotal - (linea.descuento || 0)));

  let baseImponible = 0;
  let igv = 0;
  if (linea.tipoIgv === '10') {
    // gravado: el total de línea incluye IGV
    baseImponible = redondear(totalLinea / IGV_FACTOR);
    igv = redondear(baseImponible * IGV_TASA);
  }
  // exonerado (20) e inafecto (30): no generan IGV, base = totalLinea pero en otra categoría
  return { subtotal, baseImponible, igv, totalLinea };
}

export interface TotalesVenta {
  opGravadas: number; // base imponible de operaciones gravadas
  opExoneradas: number;
  opInafectas: number;
  descuentoTotal: number;
  igvTotal: number;
  total: number; // incluye IGV
}

/** Calcula los totales de una venta a partir de sus líneas. */
export function calcularTotales(lineas: LineaVenta[]): TotalesVenta {
  let opGravadas = 0;
  let opExoneradas = 0;
  let opInafectas = 0;
  let descuentoTotal = 0;
  let igvTotal = 0;
  let total = 0;

  for (const linea of lineas) {
    const r = calcularLinea(linea);
    descuentoTotal += linea.descuento || 0;
    total += r.totalLinea;
    if (linea.tipoIgv === '10') {
      opGravadas += r.baseImponible;
      igvTotal += r.igv;
    } else if (linea.tipoIgv === '20') {
      opExoneradas += r.totalLinea;
    } else if (linea.tipoIgv === '30') {
      opInafectas += r.totalLinea;
    }
  }

  return {
    opGravadas: redondear(opGravadas),
    opExoneradas: redondear(opExoneradas),
    opInafectas: redondear(opInafectas),
    descuentoTotal: redondear(descuentoTotal),
    igvTotal: redondear(igvTotal),
    total: redondear(total),
  };
}

/** DNI peruano: exactamente 8 dígitos. */
export function validarDNI(numero: string): boolean {
  return /^\d{8}$/.test(numero);
}

/** RUC peruano: 11 dígitos, prefijo permitido y dígito verificador módulo 11. */
export function validarRUC(numero: string): boolean {
  if (!/^\d{11}$/.test(numero)) return false;
  const prefijo = numero.slice(0, 2);
  if (!['10', '15', '16', '17', '20'].includes(prefijo)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((total, peso, i) => total + Number(numero[i]) * peso, 0);
  const calculado = 11 - (suma % 11);
  const digito = calculado === 10 ? 0 : calculado === 11 ? 1 : calculado;
  return Number(numero[10]) === digito;
}

/** Devuelve la etiqueta legible de un tipo de IGV. */
export function etiquetaTipoIgv(tipo: TipoIgv): string {
  switch (tipo) {
    case '10':
      return 'Gravado';
    case '20':
      return 'Exonerado';
    case '30':
      return 'Inafecto';
    default:
      return 'Gravado';
  }
}

/** Devuelve la etiqueta legible de un tipo de comprobante. */
export function etiquetaComprobante(tipo: string): string {
  switch (tipo) {
    case '01':
      return 'Factura';
    case '03':
      return 'Boleta';
    case '07':
      return 'Nota de Crédito';
    case '08':
      return 'Nota de Débito';
    default:
      return tipo;
  }
}

/** Sugiere serie según tipo de comprobante: F001 factura, B001 boleta, NC01 NC. */
export function serieSegunTipo(tipo: string, config?: { serieFactura?: string; serieBoleta?: string; serieNC?: string }): string {
  if (tipo === '01') return config?.serieFactura || 'F001';
  if (tipo === '03') return config?.serieBoleta || 'B001';
  if (tipo === '07') return config?.serieNC || 'NC01';
  if (tipo === '08') return config?.serieNC || 'ND01';
  return 'B001';
}
