import {
  calcularImporteDevolucion, distribuirDevolucion, validarTotalReembolsos,
} from './devolucion-calculations';

describe('Cálculos de devoluciones', () => {
  it('calcula una devolución parcial proporcional con IGV incluido', () => {
    expect(calcularImporteDevolucion(118, 10, 2, 10, 118)).toBe(23.6);
  });

  it('usa el residual exacto en la última devolución para evitar centavos perdidos', () => {
    expect(calcularImporteDevolucion(10, 3, 1, 1, 3.34)).toBe(3.34);
  });

  it('no permite devolver más unidades de las disponibles', () => {
    expect(() => calcularImporteDevolucion(118, 10, 4, 3, 35.4)).toThrow();
  });

  it('aplica primero el saldo de crédito y reembolsa solo la diferencia', () => {
    expect(distribuirDevolucion(50, 30)).toEqual({ creditoRevertido: 30, montoReembolsado: 20 });
  });

  it('no genera reembolso cuando toda la devolución compensa deuda pendiente', () => {
    expect(distribuirDevolucion(25, 40)).toEqual({ creditoRevertido: 25, montoReembolsado: 0 });
  });

  it('reembolsa el total si no hay crédito pendiente', () => {
    expect(distribuirDevolucion(18.5, 0)).toEqual({ creditoRevertido: 0, montoReembolsado: 18.5 });
  });

  it('exige que los medios de pago coincidan con el importe a reembolsar', () => {
    expect(() => validarTotalReembolsos(19.99, 20)).toThrow();
    expect(() => validarTotalReembolsos(20, 20)).not.toThrow();
  });
});
