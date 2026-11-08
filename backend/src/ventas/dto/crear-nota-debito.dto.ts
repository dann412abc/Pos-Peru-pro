import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsString, Max, MaxLength, Min, MinLength, IsPositive } from 'class-validator';

export class CrearNotaDebitoDto {
  @ApiProperty({ example: 123, description: 'Línea del comprobante original cuyo valor aumenta' })
  @IsInt()
  @IsPositive()
  comprobanteLineaId: number;

  @ApiProperty({ example: 12.5, description: 'Importe adicional por aumento de valor (no incluye una operación de caja)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  monto: number;

  @ApiProperty({ example: 'Ajuste por diferencia de precio acordada' })
  @IsString()
  @MinLength(5)
  @MaxLength(250)
  motivo: string;

  @ApiProperty({ example: 'debit-note-uuid-or-stable-operation-key' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey: string;
}
