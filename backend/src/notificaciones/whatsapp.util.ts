/**
 * Formatea un numero de telefono peruano al formato internacional
 * requerido por WhatsApp Business Cloud API: 51 + 9 digitos (11 en total).
 *
 * Acepta entradas con espacios, guiones, "+", ceros iniciales y prefijo 51.
 * Devuelve null si no se puede normalizar a un numero valido.
 */
export function formatearNumeroWhatsapp(entrada: string): string | null {
  if (!entrada) return null;
  let digits = String(entrada).replace(/\D/g, '');
  if (!digits) return null;
  // Quitar ceros iniciales (ej. 01 9XX... o 09X...).
  while (digits.length > 9 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  if (digits.length === 9) {
    return '51' + digits;
  }
  if (digits.length === 11 && digits.startsWith('51')) {
    return digits;
  }
  if (digits.length === 10) {
    return '51' + digits;
  }
  // Si ya incluye otro prefijo y llega a 11+ digitos, se asume internacional.
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return null;
}
