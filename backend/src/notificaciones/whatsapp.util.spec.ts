import { formatearNumeroWhatsapp } from './whatsapp.util';

describe('Formateador de numero WhatsApp (Peru: 51 + 9 digitos)', () => {
  test('numero celular de 9 digitos => prefijo 51', () => {
    expect(formatearNumeroWhatsapp('987654321')).toBe('51987654321');
  });

  test('numero con espacios y guiones se normaliza', () => {
    expect(formatearNumeroWhatsapp('987 654 321')).toBe('51987654321');
    expect(formatearNumeroWhatsapp('+51 987-654-321')).toBe('51987654321');
  });

  test('numero ya con prefijo 51 (11 digitos) se mantiene', () => {
    expect(formatearNumeroWhatsapp('51987654321')).toBe('51987654321');
  });

  test('cero inicial (ej. 0987654321) se elimina y se agrega 51', () => {
    expect(formatearNumeroWhatsapp('0987654321')).toBe('51987654321');
  });

  test('entrada vacia o invalida devuelve null', () => {
    expect(formatearNumeroWhatsapp('')).toBeNull();
    expect(formatearNumeroWhatsapp('abc')).toBeNull();
    expect(formatearNumeroWhatsapp('12')).toBeNull();
  });
});
