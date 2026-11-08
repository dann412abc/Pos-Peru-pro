/** Cálculos monetarios de devoluciones en PEN. El servidor siempre vuelve a calcularlos. */
export const redondearMonto = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;
export const redondearCantidad = (valor: number): number => Math.round((valor + Number.EPSILON) * 1000) / 1000;

export function calcularImporteDevolucion(
  importeOriginal: number,
  cantidadOriginal: number,
  cantidadADevolver: number,
  cantidadDisponible: number,
  importeDisponible: number,
): number {
  if (![importeOriginal, cantidadOriginal, cantidadADevolver, cantidadDisponible, importeDisponible].every(Number.isFinite)) {
    throw new Error('Los importes y cantidades deben ser numéricos');
  }
  if (importeOriginal <= 0 || cantidadOriginal <= 0 || cantidadADevolver <= 0 || cantidadDisponible <= 0) {
    throw new Error('La línea no tiene importe o cantidad disponible');
  }
  if (cantidadADevolver - cantidadDisponible > 0.0001) throw new Error('La cantidad a devolver supera la cantidad disponible');
  const esUltimaFraccion = Math.abs(cantidadADevolver - cantidadDisponible) < 0.0001;
  const importe = esUltimaFraccion
    ? redondearMonto(importeDisponible)
    : redondearMonto(importeOriginal * cantidadADevolver / cantidadOriginal);
  if (importe <= 0 || importe - importeDisponible > 0.01) throw new Error('El importe calculado supera el importe disponible');
  return importe;
}

export function distribuirDevolucion(totalDevolucion: number, saldoCreditoPendiente: number): {
  creditoRevertido: number; montoReembolsado: number;
} {
  const total = redondearMonto(totalDevolucion);
  const saldo = redondearMonto(saldoCreditoPendiente);
  if (!Number.isFinite(total) || !Number.isFinite(saldo) || total <= 0 || saldo < 0) {
    throw new Error('El total de devolución o saldo de crédito no es válido');
  }
  const creditoRevertido = redondearMonto(Math.min(total, saldo));
  return { creditoRevertido, montoReembolsado: redondearMonto(total - creditoRevertido) };
}

export function validarTotalReembolsos(totalPagos: number, montoReembolsado: number): void {
  const pagos = redondearMonto(totalPagos);
  const esperado = redondearMonto(montoReembolsado);
  if (Math.abs(pagos - esperado) > 0.001) {
    throw new Error(`Los reembolsos deben sumar exactamente S/ ${esperado.toFixed(2)}`);
  }
}
