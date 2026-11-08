import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronAlertasController } from './cron-alertas.controller';

describe('CronAlertasController', () => {
  const secret = 'a-random-test-secret-with-more-than-32-characters';
  const config = { get: (key: string) => key === 'cron.secret' ? secret : undefined } as unknown as ConfigService;

  it('rechaza llamadas sin secreto o con secreto incorrecto', async () => {
    const service = { sincronizarAlertasAutomaticas: jest.fn() };
    const controller = new CronAlertasController(config, service as any);
    await expect(controller.ejecutar()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.ejecutar('secreto-incorrecto')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.sincronizarAlertasAutomaticas).not.toHaveBeenCalled();
  });

  it('ejecuta la sincronización solo con el secreto correcto', async () => {
    const result = { administradores: 1, procesados: 1, alertas: 3, errores: [] };
    const service = { sincronizarAlertasAutomaticas: jest.fn().mockResolvedValue(result) };
    const controller = new CronAlertasController(config, service as any);
    await expect(controller.ejecutar(secret)).resolves.toEqual(result);
    expect(service.sincronizarAlertasAutomaticas).toHaveBeenCalledTimes(1);
  });
});
