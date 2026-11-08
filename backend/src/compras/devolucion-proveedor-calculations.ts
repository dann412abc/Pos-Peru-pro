export function calcularAplicacionNotaProveedor(total: number, saldoPendiente: number) {
  const importe=Math.round(total*100)/100, saldo=Math.round(saldoPendiente*100)/100;
  if(!Number.isFinite(importe)||importe<=0||!Number.isFinite(saldo)||saldo<0)throw new Error('Importe o saldo inválido');
  const aplicado=Math.min(importe,saldo);
  return { aplicadoCuenta:aplicado, saldoAFavor:Math.round((importe-aplicado)*100)/100, nuevoSaldo:Math.round((saldo-aplicado)*100)/100 };
}
