import { ConfigService } from '@nestjs/config';
import { NotificacionesService } from './notificaciones.service';

describe('NotificacionesService: protección de envíos automáticos', () => {
  it('no envía email ni WhatsApp cuando el comprobante fue aceptado por el adaptador simulado', async () => {
    const ceRepo = { findOne: jest.fn().mockResolvedValue({ comprobanteId: 7, esSimulacion: true }) };
    const comprobanteRepo = { findOne: jest.fn() };
    const emailService = { enviarComprobante: jest.fn() };
    const whatsappService = { enviarComprobante: jest.fn() };
    const config = {
      get: (key: string) => key === 'notificaciones.envioAutomaticoEmail' || key === 'notificaciones.envioAutomaticoWhatsapp',
    } as unknown as ConfigService;

    const service = new NotificacionesService(
      {} as any, {} as any, {} as any, comprobanteRepo as any, {} as any, ceRepo as any,
      {} as any, {} as any, emailService as any, whatsappService as any, config, {} as any,
    );

    await service.enviarAutomaticoAceptado(7);

    expect(ceRepo.findOne).toHaveBeenCalledWith({ where: { comprobanteId: 7 } });
    expect(comprobanteRepo.findOne).not.toHaveBeenCalled();
    expect(emailService.enviarComprobante).not.toHaveBeenCalled();
    expect(whatsappService.enviarComprobante).not.toHaveBeenCalled();
  });
});
