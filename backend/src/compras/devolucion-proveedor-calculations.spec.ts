import { calcularAplicacionNotaProveedor } from './devolucion-proveedor-calculations';
describe('nota de crédito del proveedor',()=>{
  it('reduce primero la cuenta por pagar y conserva excedente como saldo a favor',()=>expect(calcularAplicacionNotaProveedor(25,40)).toEqual({aplicadoCuenta:25,saldoAFavor:0,nuevoSaldo:15}));
  it('no hace negativo el saldo pendiente cuando la devolución supera la deuda',()=>expect(calcularAplicacionNotaProveedor(50,12.5)).toEqual({aplicadoCuenta:12.5,saldoAFavor:37.5,nuevoSaldo:0}));
  it('rechaza importes no positivos',()=>expect(()=>calcularAplicacionNotaProveedor(0,10)).toThrow());
});
