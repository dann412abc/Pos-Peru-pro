import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'devoluciones.service.ts'), 'utf8');

describe('DevolucionesService - valorización del stock reingresado', () => {
  it('lee el costo histórico de la línea original de venta', () => {
    expect(source).toContain('cl.costo_unitario');
  });

  it('no crea lotes sintéticos de devolución con costo cero', () => {
    expect(source).toContain('const costoOriginal = Number(item.original.costo_unitario)');
    expect(source).toContain('costo_unitario)\n                 VALUES($1,$2,$3,$4,$5,NULL,$6,$6,$7)');
    expect(source).toContain('pendiente, costoOriginal');
    expect(source).not.toContain('VALUES($1,$2,$3,$4,$5,NULL,$6,$6,0)');
  });

  it('rechaza un costo histórico no numérico o negativo antes de crear el lote', () => {
    const guard = source.indexOf('const costoOriginal = Number(item.original.costo_unitario)');
    const insert = source.indexOf('INSERT INTO inventario_lote', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(guard);
    expect(source.slice(guard, insert)).toContain('!Number.isFinite(costoOriginal) || costoOriginal < 0');
  });
});
