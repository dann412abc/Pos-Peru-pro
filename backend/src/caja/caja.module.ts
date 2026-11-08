import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { Caja } from './entities/caja.entity';
import { Comprobante } from '../ventas/entities/comprobante.entity';
import { ComprobantePago } from '../ventas/entities/comprobante-pago.entity';
import { CajaMovimiento } from './entities/caja-movimiento.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Caja, Comprobante, ComprobantePago, CajaMovimiento])],
  controllers: [CajaController],
  providers: [CajaService],
})
export class CajaModule {}
