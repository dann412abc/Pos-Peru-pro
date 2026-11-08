import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { FeController } from './fe.controller';
import { FeService } from './fe.service';
import { FeProcessor } from './fe.processor';
import { FE_QUEUE_NAME, FE_QUEUE_PORT } from './queue.port';
import { BullFeQueueAdapter } from './bull-fe-queue.adapter';
import { ResumenDiarioService } from './resumen-diario.service';
import { ComunicacionBajaService } from './comunicacion-baja.service';
import { ComprobanteElectronico } from './entities/comprobante-electronico.entity';
import { FeEvento } from './entities/fe-evento.entity';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { MockNubefactAdapter } from './mock-nubefact.adapter';
import { OSE_ADAPTER_TOKEN } from './ose-adapter.interface';
import { StubPdfService } from './pdf/stub-pdf.service';
import { PDF_GENERADOR_TOKEN } from './pdf/generador-pdf.interface';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { SucursalesModule } from '../sucursales/sucursales.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComprobanteElectronico, FeEvento, Comprobante]),
    BullModule.registerQueue({ name: FE_QUEUE_NAME }),
    NotificacionesModule,
    SucursalesModule,
  ],
  controllers: [FeController],
  providers: [
    FeService,
    FeProcessor,
    BullFeQueueAdapter,
    { provide: FE_QUEUE_PORT, useExisting: BullFeQueueAdapter },
    ResumenDiarioService,
    ComunicacionBajaService,
    {
      provide: OSE_ADAPTER_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new MockNubefactAdapter(
        config.get<string>('ose.endpoint') || 'https://api.nubefact.com/api/v1/sandbox',
        config.get<string>('ose.token') || 'token_simulado',
        config.get<boolean>('ose.mock') ?? true,
      ),
    },
    {
      provide: 'FE_XML_DIR',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get<string>('fe.xmlDir') || './storage/fe/xml',
    },
    {
      provide: PDF_GENERADOR_TOKEN,
      useClass: StubPdfService,
    },
  ],
  exports: [FeService],
})
export class FeModule {}
