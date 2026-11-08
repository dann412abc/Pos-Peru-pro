import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';
import { Comprobante } from './entities/comprobante.entity';
import { ComprobanteLinea } from './entities/comprobante-linea.entity';
import { SerieCorrelativo } from './entities/serie-correlativo.entity';
import { ComprobantePago } from './entities/comprobante-pago.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { CajaMovimiento } from '../caja/entities/caja-movimiento.entity';
import { FeModule } from '../fe/fe.module';

@Module({
  imports: [TypeOrmModule.forFeature([Comprobante, ComprobanteLinea, ComprobantePago, SerieCorrelativo, MovimientoInventario, CajaMovimiento]), FeModule],
  controllers: [VentasController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}
