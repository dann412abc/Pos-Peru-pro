import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class RegistrarMermaDto {
  @ApiProperty({ example: 125 })
  @Type(() => Number) @IsInt() @Min(1)
  loteId: number;

  @ApiProperty({ example: 2.5, description: 'Cantidad a retirar del lote, hasta 3 decimales' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001)
  cantidad: number;

  @ApiProperty({ enum: ['VENCIDO','DANADO','PERDIDA','CONTAMINACION','OTRO'] })
  @IsIn(['VENCIDO','DANADO','PERDIDA','CONTAMINACION','OTRO'])
  motivoTipo: 'VENCIDO'|'DANADO'|'PERDIDA'|'CONTAMINACION'|'OTRO';

  @ApiProperty({ example: 'Producto vencido detectado durante revisión' })
  @IsString() @MinLength(5) @MaxLength(500)
  observacion: string;

  @ApiPropertyOptional({ example: '4e7c16a4-77d0-4f7d-8d1e-1bbff9e3bb21' })
  @IsOptional() @IsUUID()
  idempotencyKey?: string;
}
