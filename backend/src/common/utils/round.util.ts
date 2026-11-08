/**
 * Utilidad de redondeo a 2 decimales (moneda PEN).
 * Se usa redondeo bancario (half-up) mediante Math.round(x * 100) / 100.
 */
export function redondear2(valor: number): number {
  if (!isFinite(valor)) return 0;
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
