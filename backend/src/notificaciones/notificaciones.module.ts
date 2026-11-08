import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { EnvioNotificacion } from './entities/envio-notificacion.entity';
import { AlertaOperativa } from './entities/alerta-operativa.entity';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { ComprobanteElectronico } from '../fe/entities/comprobante-electronico.entity';
import { StubPdfService } from '../fe/pdf/stub-pdf.service';
import { PDF_GENERADOR_TOKEN } from '../fe/pdf/generador-pdf.interface';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { GastosModule } from '../gastos/gastos.module';
import { CronAlertasController } from './cron-alertas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EnvioNotificacion, AlertaOperativa, Comprobante, Cliente, ComprobanteElectronico, Usuario]), GastosModule],
  controllers: [NotificacionesController, CronAlertasController],
  providers: [
    NotificacionesService,
    EmailService,
    WhatsappService,
    { provide: PDF_GENERADOR_TOKEN, useClass: StubPdfService },
  ],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
