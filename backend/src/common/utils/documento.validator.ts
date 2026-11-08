import { TipoDocClienteEnum } from '../enums';

/**
 * Validacion de documentos de identidad peruanos.
 *  - DNI: exactamente 8 digitos.
 *  - RUC: 11 dígitos, prefijo permitido y dígito verificador módulo 11.
 *  - RUC de empresa: misma validación de dígito verificador.
 */

const RUC_PREFIX_VALIDOS = ['10', '15', '16', '17', '20'];

export function esDniValido(numero: string): boolean {
  if (!numero) return false;
  return /^\d{8}$/.test(numero.trim());
}

export function esRucValido(numero: string): boolean {
  if (!numero) return false;
  const n = numero.trim();
  if (!/^\d{11}$/.test(n)) return false;
  const prefijo = n.substring(0, 2);
  if (!RUC_PREFIX_VALIDOS.includes(prefijo)) return false;

  // Dígito verificador RUC (módulo 11, pesos SUNAT de izquierda a derecha).
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((total, peso, i) => total + Number(n[i]) * peso, 0);
  const calculado = 11 - (suma % 11);
  const digito = calculado === 10 ? 0 : calculado === 11 ? 1 : calculado;
  return Number(n[10]) === digito;
}

export function validarDocumento(tipo: TipoDocClienteEnum, numero: string): boolean {
  if (tipo === TipoDocClienteEnum.DNI) return esDniValido(numero);
  if (tipo === TipoDocClienteEnum.RUC) return esRucValido(numero);
  return false;
}

/** DNI reservado para el cliente "CONSUMIDOR FINAL". */
export const DNI_CONSUMIDOR_FINAL = '00000000';
