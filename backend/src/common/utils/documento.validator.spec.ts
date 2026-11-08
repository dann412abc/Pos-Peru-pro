import { esDniValido, esRucValido, validarDocumento, DNI_CONSUMIDOR_FINAL } from './documento.validator';
import { TipoDocClienteEnum } from '../enums';

describe('Validacion DNI / RUC (Peru)', () => {
  test('DNI valido: exactamente 8 digitos', () => {
    expect(esDniValido('12345678')).toBe(true);
    expect(esDniValido(DNI_CONSUMIDOR_FINAL)).toBe(true); // 00000000
  });

  test('DNI invalido: menos/mas de 8 digitos o con letras', () => {
    expect(esDniValido('1234567')).toBe(false);   // 7 digitos
    expect(esDniValido('123456789')).toBe(false); // 9 digitos
    expect(esDniValido('1234567A')).toBe(false);  // letra
    expect(esDniValido('')).toBe(false);
  });

  test('RUC válido: prefijo permitido y dígito verificador correcto', () => {
    expect(esRucValido('20601234565')).toBe(true); // 20... dígito verificador correcto
    expect(esRucValido('10123456781')).toBe(true); // 10...
    expect(esRucValido('15123456782')).toBe(true);
    expect(esRucValido('17123456785')).toBe(true);
    expect(esRucValido('20100070970')).toBe(true); // ejemplo RUC conocido con checksum correcto
  });

  test('RUC invalido: longitud o prefijo incorrecto', () => {
    expect(esRucValido('2060123456')).toBe(false);   // 10 digitos
    expect(esRucValido('11123456789')).toBe(false);  // prefijo 11 no valido
    expect(esRucValido('99123456789')).toBe(false);  // prefijo 99
    expect(esRucValido('2060123456A')).toBe(false);  // letra
    expect(esRucValido('20601234567')).toBe(false);  // checksum incorrecto
  });

  test('validarDocumento despacha segun tipo', () => {
    expect(validarDocumento(TipoDocClienteEnum.DNI, '12345678')).toBe(true);
    expect(validarDocumento(TipoDocClienteEnum.RUC, '20601234565')).toBe(true);
    expect(validarDocumento(TipoDocClienteEnum.RUC, '12345678')).toBe(false);
  });
});
