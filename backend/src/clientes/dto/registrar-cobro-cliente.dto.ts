import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class RegistrarCobroClienteDto {
  @ApiProperty({ enum: ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'TRANSFERENCIA'] })
  @IsIn(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'TRANSFERENCIA'])
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA';

  @ApiProperty({ example: 35.5, description: 'Monto a aplicar a la cuenta por cobrar (puede ser parcial)' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999)
  monto: number;

  @ApiPropertyOptional({ example: 'OP-123456' })
  @IsOptional() @IsString() @MaxLength(120)
  referencia?: string;

  @ApiProperty({ example: 'cobro-2fe4c4f1-80e5-44c4-ae1c-3b5b2d9e0f44' })
  @IsString() @Length(8, 100)
  idempotencyKey: string;
}
