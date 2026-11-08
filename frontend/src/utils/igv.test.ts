import { describe, it, expect } from 'vitest';
import {
  calcularLinea,
  calcularTotales,
  validarDNI,
  validarRUC,
  formatearMoneda,
  redondear,
  IGV_FACTOR,
} from './igv';
import type { LineaVenta } from '../types';

const lineaGravada: LineaVenta = {
  codigo: 'P001',
  nombre: 'Arroz',
  cantidad: 2,
  precioUnitario: 11.8, // incluye IGV
  tipoIgv: '10',
  descuento: 0,
};

describe('Motor IGV', () => {
  it('calcula base e IGV de línea gravada: precio incluye IGV', () => {
    const r = calcularLinea(lineaGravada);
    // subtotal = 2 * 11.8 = 23.6 ; base = 23.6 / 1.18 = 20 ; igv = 20 * 0.18 = 3.6
    expect(r.subtotal).toBe(23.6);
    expect(r.baseImponible).toBe(20);
    expect(r.igv).toBe(3.6);
    expect(r.totalLinea).toBe(23.6);
  });

  it('aplica descuento en la línea antes de calcular IGV', () => {
    const r = calcularLinea({ ...lineaGravada, descuento: 3.6 });
    // totalLinea = 20 ; base = 20/1.18 ≈ 16.95 ; igv ≈ 3.05
    expect(r.totalLinea).toBe(20);
    expect(redondear(r.baseImponible + r.igv)).toBe(20);
  });

  it('ítem exonerado no genera IGV', () => {
    const r = calcularLinea({ ...lineaGravada, tipoIgv: '20' });
    expect(r.igv).toBe(0);
    expect(r.baseImponible).toBe(0);
  });

  it('ítem inafecto no genera IGV', () => {
    const r = calcularLinea({ ...lineaGravada, tipoIgv: '30' });
    expect(r.igv).toBe(0);
  });

  it('calcularTotales desglosa gravadas/exoneradas/inafectas/IGV/total', () => {
    const lineas: LineaVenta[] = [
      { ...lineaGravada }, // gravado: base 20, igv 3.6, total 23.6
      { codigo: 'P009', nombre: 'Medicina', cantidad: 1, precioUnitario: 10, tipoIgv: '20', descuento: 0 },
      { codigo: 'P010', nombre: 'Delivery', cantidad: 1, precioUnitario: 5, tipoIgv: '30', descuento: 0 },
    ];
    const t = calcularTotales(lineas);
    expect(t.opGravadas).toBe(20);
    expect(t.opExoneradas).toBe(10);
    expect(t.opInafectas).toBe(5);
    expect(t.igvTotal).toBe(3.6);
    expect(t.total).toBe(38.6);
  });

  it('validarDNI acepta solo 8 dígitos', () => {
    expect(validarDNI('45678901')).toBe(true);
    expect(validarDNI('1234567')).toBe(false);
    expect(validarDNI('123456789')).toBe(false);
    expect(validarDNI('abcdefgh')).toBe(false);
  });

  it('validarRUC valida longitud, prefijo y dígito verificador', () => {
    expect(validarRUC('20123456786')).toBe(true);
    expect(validarRUC('10123456781')).toBe(true);
    expect(validarRUC('15123456782')).toBe(true);
    expect(validarRUC('20123456789')).toBe(false); // prefijo válido, checksum incorrecto
    expect(validarRUC('12345678901')).toBe(false); // prefijo 12 no válido
    expect(validarRUC('2012345678')).toBe(false); // 10 dígitos
  });

  it('formatearMoneda devuelve símbolo S/ y 2 decimales', () => {
    const s = formatearMoneda(1234.5);
    expect(s).toContain('S/');
    expect(s).toMatch(/1,?234\.50/);
  });

  it('IGV_FACTOR es 1.18', () => {
    expect(IGV_FACTOR).toBeCloseTo(1.18, 5);
  });
});
