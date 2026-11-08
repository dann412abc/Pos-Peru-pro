import { describe, expect, it } from 'vitest';
import { esProductoActivo } from './catalogo';

describe('filtro de productos activos del POS', () => {
  it('conserva productos activos y excluye inactivos', () => {
    expect(esProductoActivo({ activo: true })).toBe(true);
    expect(esProductoActivo({ activo: false })).toBe(false);
  });
});
