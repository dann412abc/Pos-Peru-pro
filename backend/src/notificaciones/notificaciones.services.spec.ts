import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { Comprobante } from '../ventas/entities/comprobante.entity';

/**
 * Tests de servicios de notificacion con mocks.
 * Sin credenciales SMTP/WhatsApp => los envios se SIMULAN (no se llama a APIs reales).
 */
describe('Servicios de notificacion (modo simulado)', () => {
  const comprobante = {
    id: 1, serie: 'B001', correlativo: 1, total: 11.8, totalIgv: 1.8,
  } as unknown as Comprobante;

  test('EmailService sin SMTP_HOST simula envio (no crashea)', async () => {
    const configSinSmtp = { get: (key: string) => undefined } as unknown as ConfigService;
    const service = new EmailService(configSinSmtp);
    const r = await service.enviarComprobante(comprobante, 'cliente@example.com');
    expect(r.enviado).toBe(true);
    expect(r.simulado).toBe(true);
    expect(r.error).toBeUndefined();
  });

  test('EmailService sin SMTP no marca como enviado un test de conectividad', async () => {
    const configSinSmtp = { get: (_key: string) => undefined } as unknown as ConfigService;
    const service = new EmailService(configSinSmtp);
    const r = await service.enviarPrueba('cliente@example.com');
    expect(r.enviado).toBe(false);
    expect(r.simulado).toBe(true);
  });

  test('WhatsappService sin credenciales simula envio y formatea el numero', async () => {
    const configSinWa = { get: (key: string) => undefined } as unknown as ConfigService;
    const service = new WhatsappService(configSinWa);
    const r = await service.enviarComprobante(comprobante, '987654321');
    expect(r.enviado).toBe(true);
    expect(r.simulado).toBe(true);
    expect(r.numeroFormateado).toBe('51987654321');
  });

  test('WhatsApp de prueba no se declara enviado si falta la Cloud API', async () => {
    const configSinWa = { get: (_key: string) => undefined } as unknown as ConfigService;
    const service = new WhatsappService(configSinWa);
    const r = await service.enviarPrueba('987654321');
    expect(r.enviado).toBe(false);
    expect(r.simulado).toBe(true);
  });

  test('WhatsApp no intenta enviar si hay credenciales pero falta plantilla aprobada', async () => {
    const config = { get: (key: string) => ({
      'whatsapp.phoneNumberId': 'phone-id',
      'whatsapp.accessToken': 'token-de-prueba',
      'whatsapp.apiVersion': 'v26.0',
    } as Record<string, string>)[key] } as unknown as ConfigService;
    const service = new WhatsappService(config);
    const r = await service.enviarPrueba('987654321');
    expect(service.estaConfigurado()).toBe(true);
    expect(service.estaPlantillaConfigurada()).toBe(false);
    expect(r.enviado).toBe(false);
    expect(r.error).toContain('WHATSAPP_TEMPLATE_NAME');
  });

  test('WhatsApp envía los parámetros de comprobante usando una plantilla configurada', async () => {
    const config = { get: (key: string) => ({
      'whatsapp.phoneNumberId': 'phone-id',
      'whatsapp.accessToken': 'token-de-prueba',
      'whatsapp.apiVersion': 'v26.0',
      'whatsapp.templateName': 'micarrito_comprobante',
      'whatsapp.templateLanguage': 'es_PE',
    } as Record<string, string>)[key] } as unknown as ConfigService;
    const service = new WhatsappService(config);
    const post = jest.fn().mockResolvedValue({ data: { messages: [{ id: 'wamid.test' }] } });
    (service as any).http = { post };
    const r = await service.enviarComprobante(comprobante, '987654321');
    expect(service.estaPlantillaConfigurada()).toBe(true);
    expect(r.enviado).toBe(true);
    expect(post).toHaveBeenCalledWith('/messages', expect.objectContaining({
      type: 'template',
      template: expect.objectContaining({
        name: 'micarrito_comprobante',
        language: { code: 'es_PE' },
        components: [{ type: 'body', parameters: [
          { type: 'text', text: 'B001-00000001' },
          { type: 'text', text: '11.80' },
        ] }],
      }),
    }));
  });

  test('WhatsappService con numero invalido reporta error sin crashear', async () => {
    const configSinWa = { get: (key: string) => undefined } as unknown as ConfigService;
    const service = new WhatsappService(configSinWa);
    const r = await service.enviarComprobante(comprobante, 'abc');
    expect(r.enviado).toBe(false);
    expect(r.error).toContain('invalido');
  });
});
