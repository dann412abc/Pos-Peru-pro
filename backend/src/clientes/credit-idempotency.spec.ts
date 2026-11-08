import { esMismoCobroRegistrado } from './credit-idempotency';

describe('idempotencia de cobranzas', () => {
  const previo = {
    cuentaId: '25', monto: '30.00', metodoPago: 'YAPE', referencia: 'OP-ABC-123',
  };
  const esperado = {
    cuentaId: 25, monto: 30, metodoPago: 'YAPE', referencia: 'OP-ABC-123',
  };

  it('acepta el reintento exacto de la misma cobranza', () => {
    expect(esMismoCobroRegistrado(previo, esperado)).toBe(true);
  });

  it('rechaza reutilizar una clave con otro importe', () => {
    expect(esMismoCobroRegistrado(previo, { ...esperado, monto: 31 })).toBe(false);
  });

  it('rechaza reutilizar una clave con otro método, referencia o cuenta', () => {
    expect(esMismoCobroRegistrado(previo, { ...esperado, metodoPago: 'EFECTIVO' })).toBe(false);
    expect(esMismoCobroRegistrado(previo, { ...esperado, referencia: 'OTRA-OP' })).toBe(false);
    expect(esMismoCobroRegistrado(previo, { ...esperado, cuentaId: 26 })).toBe(false);
  });
});
