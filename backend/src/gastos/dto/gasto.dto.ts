import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CrearGastoDto {
  @ApiProperty({ example: 'ALQUILER' })
  @IsIn(['ALQUILER','SERVICIOS','PERSONAL','TRANSPORTE','MANTENIMIENTO','SUMINISTROS','IMPUESTOS','OTROS'])
  categoria: string;

  @ApiProperty({ example: 'Pago mensual de alquiler del local' })
  @IsString() @MinLength(5) @MaxLength(240)
  descripcion: string;

  @ApiProperty({ example: 850 })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  monto: number;

  @ApiProperty({ enum: ['EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA'], example: 'YAPE' })
  @IsIn(['EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA'])
  metodoPago: string;

  @ApiProperty({ example: '2026-11-07' })
  @IsDateString()
  fecha: string;

  @ApiProperty({ required: false, example: '2026-11-15' })
  @IsOptional() @IsDateString()
  fechaVencimiento?: string;
}

export class PagarGastoDto {
  @ApiProperty({ enum: ['EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA'], example: 'YAPE' })
  @IsIn(['EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA'])
  metodoPago: string;

  @ApiProperty({ example: 'OP-123456', required: false })
  @IsOptional() @IsString() @MaxLength(100)
  referencia?: string;

  @ApiProperty({ example: '2026-11-07' })
  @IsDateString()
  fechaPago: string;
}
