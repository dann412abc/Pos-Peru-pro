import type { Producto } from '../types';

/** Booleanos son válidos en los objetos, pero no son claves indexables de IndexedDB. */
export function esProductoActivo(producto: Pick<Producto, 'activo'>): boolean {
  return producto.activo === true;
}
