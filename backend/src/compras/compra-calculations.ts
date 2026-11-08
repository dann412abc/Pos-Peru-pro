import { redondear2 } from '../common/utils/round.util';

export interface CalculoLineaCompra {
  importe: number;
  baseImponible: number;
  igv: number;
  subtotal: number;
}

/** El costo unitario se recibe con IGV incluido, igual que los precios del catálogo POS. */
export function calcularLineaCompra(cantidad: number, costoUnitario: number, tipoIgv: number): CalculoLineaCompra {
  if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(costoUnitario) || costoUnitario <= 0) {
    throw new Error('Cantidad y costo unitario deben ser mayores a cero');
  }
  if (![10, 20, 30].includes(tipoIgv)) throw new Error('Tipo de IGV inválido');
  const importe = redondear2(cantidad * costoUnitario);
  const baseImponible = tipoIgv === 10 ? redondear2(importe / 1.18) : importe;
  const igv = tipoIgv === 10 ? redondear2(importe - baseImponible) : 0;
  return { importe, baseImponible, igv, subtotal: redondear2(baseImponible + igv) };
}

/** Costo promedio ponderado por cantidad existente y cantidad recibida. */
export function calcularCostoPromedio(
  stockActual: number,
  costoPromedioActual: number,
  cantidadRecibida: number,
  costoNuevo: number,
): number {
  const stockNuevo = stockActual + cantidadRecibida;
  if (![stockActual, costoPromedioActual, cantidadRecibida, costoNuevo, stockNuevo].every(Number.isFinite)
    || stockActual < 0 || cantidadRecibida <= 0 || costoPromedioActual < 0 || costoNuevo <= 0 || stockNuevo <= 0) {
    throw new Error('Datos inválidos para calcular costo promedio');
  }
  return Number(((stockActual * costoPromedioActual + cantidadRecibida * costoNuevo) / stockNuevo).toFixed(4));
}

export interface ConversionEmpaqueCompra {
  cantidadEmpaques: number;
  unidadesPorEmpaque: number;
  costoEmpaque: number;
  cantidadUnidades: number;
  costoUnitario: number;
}

/** Convierte el costo/cantidad de cajas, paquetes o docenas a unidades reales de inventario. */
export function convertirEmpaqueCompra(
  cantidadEmpaques: number,
  unidadesPorEmpaque: number,
  costoEmpaque: number,
): ConversionEmpaqueCompra {
  if (![cantidadEmpaques, unidadesPorEmpaque, costoEmpaque].every(Number.isFinite)
    || cantidadEmpaques <= 0 || unidadesPorEmpaque <= 0 || costoEmpaque <= 0) {
    throw new Error('Cantidad de empaques, unidades por empaque y costo por empaque deben ser mayores a cero');
  }
  const cantidadUnidades = Number((cantidadEmpaques * unidadesPorEmpaque).toFixed(3));
  const costoUnitario = Number((costoEmpaque / unidadesPorEmpaque).toFixed(4));
  if (cantidadUnidades <= 0 || cantidadUnidades > 999999999.999 || costoUnitario <= 0 || costoUnitario > 99999999.9999) throw new Error('La conversión del empaque produjo una cantidad o costo unitario inválido');
  return { cantidadEmpaques, unidadesPorEmpaque, costoEmpaque, cantidadUnidades, costoUnitario };
}
