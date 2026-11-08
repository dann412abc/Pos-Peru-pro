import { Module } from '@nestjs/common';
import { GastosController } from './gastos.controller';
import { GastosService } from './gastos.service';

@Module({ controllers: [GastosController], providers: [GastosService], exports: [GastosService] })
export class GastosModule {}
