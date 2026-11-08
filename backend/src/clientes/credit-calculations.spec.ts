import {
  calcularDisponibleCredito, calcularSaldoLuegoDeCobro, estadoCuentaPorSaldo,
} from './credit-calculations';

describe('cálculos de cuentas por cobrar', () => {
  it('calcula el crédito disponible sin permitir valores negativos', () => {
    expect(calcularDisponibleCredito(500, 120.5)).toBe(379.5);
    expect(calcularDisponibleCredito(100, 125)).toBe(0);
  });

  it('acepta cobros parciales y conserva la precisión de céntimos', () => {
    expect(calcularSaldoLuegoDeCobro(100, 35.25)).toBe(64.75);
    expect(calcularSaldoLuegoDeCobro(100, 100)).toBe(0);
    expect(calcularSaldoLuegoDeCobro(100, 99.99)).toBe(0.01);
  });

  it('rechaza pagos superiores al saldo y saldos inválidos', () => {
    expect(() => calcularSaldoLuegoDeCobro(50, 50.01)).toThrow('supera el saldo');
    expect(() => calcularSaldoLuegoDeCobro(0, 1)).toThrow('no tiene saldo');
  });

  it('cambia el estado de acuerdo con el saldo restante', () => {
    expect(estadoCuentaPorSaldo(75)).toBe('PARCIAL');
    expect(estadoCuentaPorSaldo(0)).toBe('PAGADA');
    expect(estadoCuentaPorSaldo(0.01)).toBe('PARCIAL');
  });
});
