import { Module } from '@nestjs/common';
import { DevolucionesController } from './devoluciones.controller';
import { DevolucionesService } from './devoluciones.service';
import { FeModule } from '../fe/fe.module';

@Module({
  controllers: [DevolucionesController],
  imports: [FeModule],
  providers: [DevolucionesService],
  exports: [DevolucionesService],
})
export class DevolucionesModule {}
