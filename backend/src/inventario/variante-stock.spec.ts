import { calcularStockVariante } from './variante-stock';

describe('stock de variantes', () => {
  it('suma entradas con precisión de tres decimales', () => {
    expect(calcularStockVariante(2.125, 1.375, 'ENTRADA')).toBe(3.5);
  });
  it('descuenta salidas disponibles', () => {
    expect(calcularStockVariante(8, 2.5, 'SALIDA')).toBe(5.5);
  });
  it('rechaza salidas por encima del saldo', () => {
    expect(() => calcularStockVariante(1, 2, 'SALIDA')).toThrow('Stock insuficiente');
  });
  it('rechaza cantidades inválidas', () => {
    expect(() => calcularStockVariante(1, 0, 'ENTRADA')).toThrow();
    expect(() => calcularStockVariante(1, 0.0001, 'ENTRADA')).toThrow();
  });
});
