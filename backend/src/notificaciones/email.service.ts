import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Comprobante } from '../ventas/entities/comprobante.entity';

export interface ResultadoEnvioEmail {
  enviado: boolean;
  simulado: boolean;
  mensajeId?: string;
  error?: string;
}

/**
 * Servicio de correo electronico (Nodemailer). SMTP configurable por .env.
 * Si no hay credenciales SMTP configuradas, SIMULA el envio (no crashea).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transport: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('smtp.host');
    if (host) {
      this.transport = nodemailer.createTransport({
        host,
        port: this.config.get<number>('smtp.port') || 587,
        secure: (this.config.get<number>('smtp.port') || 587) === 465,
        auth: {
          user: this.config.get<string>('smtp.user') || undefined,
          pass: this.config.get<string>('smtp.pass') || undefined,
        },
      });
    } else {
      this.logger.warn('SMTP no configurado (SMTP_HOST vacio): los envios de email se SIMULARAN.');
    }
  }

  estaConfigurado(): boolean { return this.transport !== null; }

  async enviarPrueba(destino: string): Promise<ResultadoEnvioEmail> {
    if (!this.transport) return { enviado: false, simulado: true, error: 'SMTP no está configurado en el backend.' };
    try {
      const from = this.config.get<string>('smtp.from') || 'Mi Carrito POS <no-responder@micarritopos.pe>';
      const info = await this.transport.sendMail({
        from, to: destino, subject: 'Prueba de conexión - Mi Carrito POS',
        text: 'Este es un mensaje de prueba de la configuración SMTP de Mi Carrito POS. No es un comprobante de venta.',
      });
      return { enviado: true, simulado: false, mensajeId: info.messageId };
    } catch (err) {
      return { enviado: false, simulado: false, error: (err as Error).message };
    }
  }

  async enviarComprobante(
    comprobante: Comprobante,
    emailDestino: string,
    pdfBuffer?: Buffer,
    nombrePdf?: string,
  ): Promise<ResultadoEnvioEmail> {
    const from = this.config.get<string>('smtp.from') || 'Mi Carrito POS <no-responder@micarritopos.pe>';
    const asunto = `Comprobante ${comprobante.serie}-${String(comprobante.correlativo).padStart(8, '0')} - Mi Carrito POS`;
    const html = `
      <h2>Mi Carrito POS</h2>
      <p>Estimado cliente, adjuntamos su comprobante de pago electronico.</p>
      <ul>
        <li><b>Comprobante:</b> ${comprobante.serie}-${String(comprobante.correlativo).padStart(8, '0')}</li>
        <li><b>Total:</b> S/ ${Number(comprobante.total).toFixed(2)}</li>
        <li><b>IGV:</b> S/ ${Number(comprobante.totalIgv).toFixed(2)}</li>
      </ul>
      <p>Si el PDF no se adjunta, puede descargarlo desde su portal de cliente.</p>
    `;

    if (!this.transport) {
      this.logger.log(`[SIMULADO] Email a ${emailDestino}: ${asunto}`);
      return { enviado: true, simulado: true };
    }

    try {
      const info = await this.transport.sendMail({
        from,
        to: emailDestino,
        subject: asunto,
        html,
        attachments: pdfBuffer
          ? [{ filename: nombrePdf || `comprobante-${comprobante.id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
          : [],
      });
      return { enviado: true, simulado: false, mensajeId: info.messageId };
    } catch (err) {
      return { enviado: false, simulado: false, error: (err as Error).message };
    }
  }
}
