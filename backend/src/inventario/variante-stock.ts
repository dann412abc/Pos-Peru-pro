export function calcularStockVariante(stockActual: number, cantidad: number, tipo: 'ENTRADA' | 'SALIDA'): number {
  if (!Number.isFinite(stockActual) || stockActual < 0) throw new Error('Stock actual inválido');
  if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.round(cantidad * 1000) !== cantidad * 1000) {
    throw new Error('La cantidad debe ser positiva y tener hasta 3 decimales');
  }
  if (tipo === 'SALIDA' && stockActual < cantidad) throw new Error('Stock insuficiente');
  return Number((tipo === 'ENTRADA' ? stockActual + cantidad : stockActual - cantidad).toFixed(3));
}
