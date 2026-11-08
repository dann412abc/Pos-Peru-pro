import { ComprobanteElectronico } from '../entities/comprobante-electronico.entity';

/** Formatos de papel soportados para el representante impreso (PDF). */
export type FormatoTicket = '58mm' | '80mm' | 'A5';

export const FORMATOS_TICKET_VALIDOS: FormatoTicket[] = ['58mm', '80mm', 'A5'];

/**
 * Interfaz del generador de PDF representante de comprobantes.
 * La implementacion por defecto es un STUB (no usa librerias pesadas);
 * en produccion se reemplaza por pdfkit / puppeteer respetando esta interfaz.
 */
export interface GeneradorPdfInterface {
  /** True cuando el provider es solo una plantilla provisional, no apta para adjuntar al cliente. */
  readonly esStub?: boolean;
  generarPdf(comprobante: ComprobanteElectronico, formato: FormatoTicket): Promise<Buffer>;
}

export const PDF_GENERADOR_TOKEN = 'PDF_GENERADOR';
