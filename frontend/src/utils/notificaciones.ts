// Utilidades de envío de comprobantes por WhatsApp y correo electrónico.
import type { Venta } from '../types';

const COMPROBANTE_URL_BASE =
  (import.meta.env.VITE_COMPROBANTE_URL_BASE as string | undefined) || 'https://micarritopos.pe/comprobante';

/**
 * Normaliza un número de teléfono peruano a formato internacional para WhatsApp.
 * Reglas: Perú = prefijo 51 + 9 dígitos (celular 9XX XXX XXX → 519XXXXXXXX).
 * Se eliminan espacios, guiones, signo +. Si ya empieza con 51 y tiene 11 dígitos se conserva.
 * Devuelve '' si no se puede normalizar.
 */
export function formatearWhatsApp(telefono: string): string {
  if (!telefono) return '';
  const limpio = telefono.replace(/\D/g, '');
  if (limpio.length === 9 && limpio.startsWith('9')) return `51${limpio}`;
  if (limpio.length === 11 && limpio.startsWith('51')) return limpio;
  if (limpio.length === 10 && limpio.startsWith('1')) return `5${limpio}`; // 51 + 9? caso raro
  // Si tiene 9 dígitos pero no empieza con 9, igual se asume celular peruano
  if (limpio.length === 9) return `51${limpio}`;
  return '';
}

/** Construye la URL de wa.me con el mensaje prearmado. */
export function construirUrlWhatsApp(telefono: string, venta: Venta, nombreNegocio: string): string {
  const numero = formatearWhatsApp(telefono);
  const serieCorrelativo = `${venta.serie}-${String(venta.correlativo).padStart(8, '0')}`;
  const urlComprobante = `${COMPROBANTE_URL_BASE}/${venta.tipoComprobante}/${venta.serie}/${venta.correlativo}`;
  const mensaje =
    `Mi Carrito POS - Comprobante ${serieCorrelativo} de ${nombreNegocio}. ` +
    `Total: S/ ${venta.total.toFixed(2)}. ` +
    `Descarga tu comprobante: ${urlComprobante}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** Construye asunto y cuerpo del correo para el comprobante. */
export function construirEmail(venta: Venta, nombreNegocio: string, emailDestino: string) {
  const serieCorrelativo = `${venta.serie}-${String(venta.correlativo).padStart(8, '0')}`;
  const urlComprobante = `${COMPROBANTE_URL_BASE}/${venta.tipoComprobante}/${venta.serie}/${venta.correlativo}`;
  const asunto = `Comprobante ${serieCorrelativo} - ${nombreNegocio}`;
  const cuerpo =
    `Estimado(a) ${venta.cliente.nombre},\n\n` +
    `Adjuntamos su comprobante electrónico ${serieCorrelativo} por un total de S/ ${venta.total.toFixed(2)}.\n` +
    `Puede descargarlo desde: ${urlComprobante}\n\n` +
    `--\nMi Carrito POS - Sistema de facturación electrónica para Perú\n${nombreNegocio}`;
  return { emailDestino, asunto, cuerpo };
}
