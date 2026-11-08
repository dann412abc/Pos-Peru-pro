import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';
import { Producto } from './entities/producto.entity';
import { ProductoVariantesController, ProductoVarianteLookupController } from './producto-variantes.controller';
import { ProductoVariantesService } from './producto-variantes.service';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Producto, MovimientoInventario])],
  controllers: [ProductosController, ProductoVariantesController, ProductoVarianteLookupController],
  providers: [ProductosService, ProductoVariantesService],
})
export class ProductosModule {}
