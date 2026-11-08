import { redondear2 } from '../common/utils/round.util';

export type EstadoCuentaCobrar = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'AJUSTADA' | 'ANULADA';

export function calcularDisponibleCredito(limite: number, saldo: number): number {
  return Math.max(0, redondear2(Number(limite || 0) - Number(saldo || 0)));
}

export function calcularSaldoLuegoDeCobro(saldoPendiente: number, montoCobro: number): number {
  const saldo = redondear2(Number(saldoPendiente));
  const monto = redondear2(Number(montoCobro));
  if (!Number.isFinite(saldo) || saldo <= 0) throw new Error('La cuenta no tiene saldo pendiente');
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('El cobro debe ser mayor a cero');
  if (monto > saldo + 0.001) throw new Error('El cobro supera el saldo pendiente');
  const restante = redondear2(saldo - monto);
  return restante;
}

export function estadoCuentaPorSaldo(saldoPendiente: number): EstadoCuentaCobrar {
  const saldo = redondear2(Number(saldoPendiente));
  if (!Number.isFinite(saldo) || saldo < 0) throw new Error('Saldo de cuenta inválido');
  return saldo === 0 ? 'PAGADA' : 'PARCIAL';
}
