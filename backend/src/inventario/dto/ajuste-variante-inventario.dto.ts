import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AjusteVarianteInventarioDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  varianteId: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  sucursalId: number;

  @ApiProperty({ enum: ['ENTRADA', 'SALIDA'] })
  @IsIn(['ENTRADA', 'SALIDA'])
  tipo: 'ENTRADA' | 'SALIDA';

  @ApiProperty({ example: 12 })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001)
  cantidad: number;

  @ApiProperty({ example: 'Ingreso por compra de presentación x 6' })
  @IsString() @MinLength(5) @MaxLength(200)
  motivo: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional() @IsString() @MaxLength(100)
  idempotencyKey?: string;
}
