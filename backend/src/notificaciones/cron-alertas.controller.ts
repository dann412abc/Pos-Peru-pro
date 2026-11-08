import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { NotificacionesService } from './notificaciones.service';

/** Endpoint interno para Cloudflare Worker Cron Trigger. No utiliza JWT; exige secreto propio. */
@Controller('api/internal/cron')
export class CronAlertasController {
  constructor(private readonly config: ConfigService, private readonly service: NotificacionesService) {}

  @Post('alertas')
  async ejecutar(@Headers('x-cron-secret') recibido?: string) {
    const esperado = this.config.get<string>('cron.secret');
    if (!esperado || !recibido) throw new UnauthorizedException('Cron no autorizado');
    const a = Buffer.from(esperado, 'utf8');
    const b = Buffer.from(recibido, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Cron no autorizado');
    return this.service.sincronizarAlertasAutomaticas();
  }
}
