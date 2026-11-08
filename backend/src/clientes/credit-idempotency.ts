/** Compara el cuerpo de una reejecución con el cobro ya persistido. */
export function esMismoCobroRegistrado(
  previo: {
    cuentaId: number | string;
    monto: number | string;
    metodoPago: string;
    referencia?: string | null;
  },
  esperado: {
    cuentaId: number;
    monto: number;
    metodoPago: string;
    referencia?: string | null;
  },
): boolean {
  return Number(previo.cuentaId) === esperado.cuentaId
    && Math.round(Number(previo.monto) * 100) === Math.round(esperado.monto * 100)
    && String(previo.metodoPago) === esperado.metodoPago
    && String(previo.referencia || '').trim() === String(esperado.referencia || '').trim();
}
