import { BadRequestException } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';

describe('NotificacionesService: protección de comprobantes', () => {
  function crearServicio(esSimulacion: boolean) {
    const comprobanteRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, clienteId: 9, serie: 'B001', correlativo: 1 }) };
    const clienteRepo = { findOne: jest.fn().mockResolvedValue({ email: 'cliente@example.com', telefono: '987654321' }) };
    const ceRepo = { findOne: jest.fn().mockResolvedValue({ comprobanteId: 7, estadoActual: 'ACEPTADO', esSimulacion }) };
    const emailService = { enviarComprobante: jest.fn() };
    const whatsappService = { enviarComprobante: jest.fn() };
    const service = new NotificacionesService(
      {} as any, {} as any, {} as any, comprobanteRepo as any, clienteRepo as any,
      ceRepo as any, {} as any, {} as any, emailService as any, whatsappService as any,
      { get: () => undefined } as any, { esStub: true, generarPdf: jest.fn() } as any,
    );
    return { service, emailService, whatsappService };
  }

  it('rechaza email y WhatsApp cuando el OSE solo simuló la aceptación', async () => {
    const { service, emailService, whatsappService } = crearServicio(true);
    await expect(service.enviarEmail(7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.enviarWhatsapp(7)).rejects.toBeInstanceOf(BadRequestException);
    expect(emailService.enviarComprobante).not.toHaveBeenCalled();
    expect(whatsappService.enviarComprobante).not.toHaveBeenCalled();
  });

  it('no adjunta una plantilla PDF provisional aunque exista aceptación real', async () => {
    const { service, emailService } = crearServicio(false);
    await expect(service.enviarEmail(7)).rejects.toBeInstanceOf(BadRequestException);
    expect(emailService.enviarComprobante).not.toHaveBeenCalled();
  });
});
