import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { formatearNumeroWhatsapp } from './whatsapp.util';

export interface ResultadoEnvioWhatsapp {
  enviado: boolean;
  simulado: boolean;
  numeroFormateado?: string;
  error?: string;
}

/**
 * Servicio de WhatsApp Business Cloud API.
 * Configurable por .env (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
 * WHATSAPP_API_VERSION). SIN credenciales => SIMULA el envio (no llama APIs reales).
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private http: AxiosInstance | null = null;
  private phoneNumberId: string | undefined;
  private templateName: string | undefined;
  private templateLanguage: string;

  constructor(private readonly config: ConfigService) {
    this.phoneNumberId = this.config.get<string>('whatsapp.phoneNumberId');
    const token = this.config.get<string>('whatsapp.accessToken');
    const version = this.config.get<string>('whatsapp.apiVersion') || 'v26.0';
    this.templateName = this.config.get<string>('whatsapp.templateName')?.trim() || undefined;
    this.templateLanguage = this.config.get<string>('whatsapp.templateLanguage') || 'es_PE';
    if (this.phoneNumberId && token) {
      this.http = axios.create({
        baseURL: `https://graph.facebook.com/${version}/${this.phoneNumberId}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      });
    } else {
      this.logger.warn('WhatsApp no configurado: los envios se SIMULARAN.');
    }
  }

  estaConfigurado(): boolean { return this.http !== null; }

  estaPlantillaConfigurada(): boolean { return Boolean(this.http && this.templateName); }

  async enviarPrueba(numeroDestino: string): Promise<ResultadoEnvioWhatsapp> {
    const numero = formatearNumeroWhatsapp(numeroDestino);
    if (!numero) return { enviado: false, simulado: false, error: `Número inválido: ${numeroDestino}` };
    if (!this.http) return { enviado: false, simulado: true, numeroFormateado: numero, error: 'WhatsApp Business Cloud API no está configurado en el backend.' };
    if (!this.templateName) return { enviado: false, simulado: false, numeroFormateado: numero, error: 'Configure WHATSAPP_TEMPLATE_NAME con una plantilla aprobada por Meta antes de probar el canal.' };
    try {
      await this.http.post('/messages', {
        messaging_product: 'whatsapp',
        to: numero,
        type: 'template',
        template: {
          name: this.templateName,
          language: { code: this.templateLanguage },
          components: [{ type: 'body', parameters: [
            { type: 'text', text: 'PRUEBA' },
            { type: 'text', text: '0.00' },
          ] }],
        },
      });
      return { enviado: true, simulado: false, numeroFormateado: numero };
    } catch (err) {
      return { enviado: false, simulado: false, numeroFormateado: numero, error: (err as Error).message };
    }
  }

  async enviarComprobante(comprobante: Comprobante, numeroDestino: string): Promise<ResultadoEnvioWhatsapp> {
    const numero = formatearNumeroWhatsapp(numeroDestino);
    if (!numero) {
      return { enviado: false, simulado: false, error: `Numero invalido: ${numeroDestino}` };
    }
    if (!this.http) {
      this.logger.log(`[SIMULADO] WhatsApp a ${numero}: comprobante ${comprobante.serie}-${comprobante.correlativo}`);
      return { enviado: true, simulado: true, numeroFormateado: numero };
    }

    if (!this.templateName) {
      return { enviado: false, simulado: false, numeroFormateado: numero, error: 'Falta WHATSAPP_TEMPLATE_NAME: los envíos automáticos requieren una plantilla aprobada por Meta.' };
    }

    try {
      await this.http.post('/messages', {
        messaging_product: 'whatsapp',
        to: numero,
        type: 'template',
        template: {
          name: this.templateName,
          language: { code: this.templateLanguage },
          components: [{ type: 'body', parameters: [
            { type: 'text', text: `${comprobante.serie}-${String(comprobante.correlativo).padStart(8, '0')}` },
            { type: 'text', text: Number(comprobante.total).toFixed(2) },
          ] }],
        },
      });
      return { enviado: true, simulado: false, numeroFormateado: numero };
    } catch (err) {
      return { enviado: false, simulado: false, numeroFormateado: numero, error: (err as Error).message };
    }
  }
}
