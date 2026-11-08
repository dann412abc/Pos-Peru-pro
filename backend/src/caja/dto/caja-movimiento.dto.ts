import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CajaMovimientoDto {
  @ApiProperty({ enum: ['INGRESO', 'SALIDA'], example: 'SALIDA' })
  @IsIn(['INGRESO', 'SALIDA'])
  tipo: 'INGRESO' | 'SALIDA';

  @ApiProperty({ enum: ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN'], example: 'EFECTIVO' })
  @IsIn(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN'])
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN';

  @ApiProperty({ example: 35.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @ApiProperty({ example: 'Compra de bolsas para el negocio' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  motivo: string;
}
