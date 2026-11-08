import { calcularLinea, calcularComprobante } from './igv.engine';
import { TipoIgvEnum } from '../../common/enums';

describe('Motor de calculo IGV (Peru 18%)', () => {
  test('linea gravada: precio incluye IGV => base = precio/1.18, igv = base*0.18', () => {
    // S/ 11.80 incluye IGV: base = 10.00, igv = 1.80
    const r = calcularLinea({ cantidad: 1, precioUnitario: 11.80, tipoIgv: TipoIgvEnum.GRAVADO });
    expect(r.baseImponible).toBe(10.00);
    expect(r.igv).toBe(1.80);
    expect(r.subtotal).toBe(11.80);
  });

  test('linea gravada con cantidad > 1', () => {
    // 2 x S/ 5.90 = 11.80 => base 10.00, igv 1.80
    const r = calcularLinea({ cantidad: 2, precioUnitario: 5.90, tipoIgv: TipoIgvEnum.GRAVADO });
    expect(r.baseImponible).toBe(10.00);
    expect(r.igv).toBe(1.80);
  });

  test('descuento por linea se resta ANTES de calcular IGV', () => {
    // precio 11.80, descuento 1.18 => base bruta 10.62 => base=9.00, igv=1.62
    const r = calcularLinea({ cantidad: 1, precioUnitario: 11.80, descuento: 1.18, tipoIgv: TipoIgvEnum.GRAVADO });
    expect(r.importeBruto).toBe(11.80);
    expect(r.baseImponible).toBe(9.00);
    expect(r.igv).toBe(1.62);
    expect(r.subtotal).toBe(10.62);
  });

  test('linea exonerada (20): no suma IGV, base = importe, igv = 0', () => {
    const r = calcularLinea({ cantidad: 2, precioUnitario: 5.00, tipoIgv: TipoIgvEnum.EXONERADO });
    expect(r.baseImponible).toBe(10.00);
    expect(r.igv).toBe(0);
    expect(r.subtotal).toBe(10.00);
  });

  test('linea inafecta (30): no suma IGV', () => {
    const r = calcularLinea({ cantidad: 1, precioUnitario: 3.00, tipoIgv: TipoIgvEnum.INAFECTO });
    expect(r.baseImponible).toBe(3.00);
    expect(r.igv).toBe(0);
    expect(r.subtotal).toBe(3.00);
  });

  test('comprobante mixto gravado+exonerado+inafecto: totales correctos y redondeo a 2 decimales', () => {
    const { totales, lineas } = calcularComprobante([
      { cantidad: 1, precioUnitario: 11.80, tipoIgv: TipoIgvEnum.GRAVADO },      // base 10, igv 1.80
      { cantidad: 1, precioUnitario: 5.00, tipoIgv: TipoIgvEnum.EXONERADO },      // base 5, igv 0
      { cantidad: 1, precioUnitario: 3.00, descuento: 0.50, tipoIgv: TipoIgvEnum.INAFECTO }, // base 2.50
    ]);
    expect(totales.opGravadas).toBe(10.00);
    expect(totales.opExoneradas).toBe(5.00);
    expect(totales.opInafectas).toBe(2.50);
    expect(totales.totalIgv).toBe(1.80);
    expect(totales.total).toBe(19.30); // 10+5+2.50+1.80
    // Cada linea redondeada a 2 decimales.
    for (const l of lineas) {
      expect(String(l.baseImponible).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
      expect(String(l.igv).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
    }
  });

  test('descuento global se resta del total final', () => {
    const { totales } = calcularComprobante(
      [{ cantidad: 1, precioUnitario: 11.80, tipoIgv: TipoIgvEnum.GRAVADO }],
      1.00,
    );
    expect(totales.descuentoGlobal).toBe(1.00);
    expect(totales.total).toBe(10.80); // 11.80 - 1.00
  });
});
