import { calcularCostoPromedio, calcularLineaCompra, convertirEmpaqueCompra } from './compra-calculations';

describe('cálculos de compras', () => {
  it('separa base e IGV cuando el costo recibido incluye IGV', () => {
    expect(calcularLineaCompra(1, 118, 10)).toEqual({ importe: 118, baseImponible: 100, igv: 18, subtotal: 118 });
  });

  it('no agrega IGV a una compra exonerada o inafecta', () => {
    expect(calcularLineaCompra(2, 10, 20)).toEqual({ importe: 20, baseImponible: 20, igv: 0, subtotal: 20 });
    expect(calcularLineaCompra(1, 50, 30)).toEqual({ importe: 50, baseImponible: 50, igv: 0, subtotal: 50 });
  });

  it('convierte cajas a unidades y distribuye el costo por unidad', () => {
    expect(convertirEmpaqueCompra(10, 12, 36)).toEqual({
      cantidadEmpaques: 10, unidadesPorEmpaque: 12, costoEmpaque: 36,
      cantidadUnidades: 120, costoUnitario: 3,
    });
  });

  it('mantiene conversión unitaria cuando el empaque es una unidad', () => {
    expect(convertirEmpaqueCompra(5, 1, 2.5).cantidadUnidades).toBe(5);
    expect(convertirEmpaqueCompra(5, 1, 2.5).costoUnitario).toBe(2.5);
  });

  it('rechaza empaques sin unidades o sin costo', () => {
    expect(() => convertirEmpaqueCompra(1, 0, 10)).toThrow();
    expect(() => convertirEmpaqueCompra(1, 12, 0)).toThrow();
  });

  it('calcula costo promedio ponderado', () => {
    expect(calcularCostoPromedio(100, 10, 50, 12)).toBe(10.6667);
  });

  it('inicia el costo promedio cuando no existía stock', () => {
    expect(calcularCostoPromedio(0, 0, 5, 7.25)).toBe(7.25);
  });
});
