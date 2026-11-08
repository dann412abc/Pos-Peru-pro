import { Injectable } from '@nestjs/common';
import { ComprobanteElectronico } from '../entities/comprobante-electronico.entity';
import { FormatoTicket, GeneradorPdfInterface } from './generador-pdf.interface';

/**
 * Implementacion STUB del generador de PDF representante.
 * Construye un PDF 1.4 minimo valido (una pagina con texto) sin dependencias
 * externas. En produccion se reemplaza por pdfkit manteniendo la misma interfaz.
 */
@Injectable()
export class StubPdfService implements GeneradorPdfInterface {
  readonly esStub = true;
  async generarPdf(comprobante: ComprobanteElectronico, formato: FormatoTicket): Promise<Buffer> {
    const lineas = [
      'Mi Carrito POS - Tu punto de venta, siempre contigo',
      `Representacion impresa del comprobante #${comprobante.comprobanteId}`,
      `Estado FE: ${comprobante.estadoActual}`,
      comprobante.esSimulacion ? 'PRUEBA SIMULADA - SIN VALIDEZ TRIBUTARIA / NO RECIBIDO POR SUNAT' : 'PLANTILLA PROVISIONAL - NO ES REPRESENTACION IMPRESA COMPLETA',
      `Formato: ${formato}`,
      comprobante.hashCdr ? `CDR: ${comprobante.hashCdr.slice(0, 16)}...` : 'CDR pendiente',
    ];
    return Buffer.from(StubPdfService.construirPdfMinimo(lineas), 'binary');
  }

  /** Construye un PDF 1.4 minimalista con una pagina y texto. */
  static construirPdfMinimo(lineas: string[]): string {
    const textoStream = lineas
      .map((l, i) => `BT /F1 10 Tf 40 ${780 - i * 18} Td (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`)
      .join('\n');
    const stream = `\n${textoStream}\n`;

    const objetos: string[] = [];
    objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objetos[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
    objetos[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
    objetos[4] = `<< /Length ${stream.length} >>\nstream${stream}endstream`;
    objetos[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 1; i <= 5; i++) {
      offsets[i] = Buffer.byteLength(pdf, 'binary');
      pdf += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(pdf, 'binary');
    pdf += 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return pdf;
  }
}
