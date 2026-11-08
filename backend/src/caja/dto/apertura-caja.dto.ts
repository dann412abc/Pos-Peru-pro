import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsPositive, Min, ValidateNested, IsArray, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class AperturaCajaDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  sucursalId: number;

  @ApiPropertyOptional({ example: 100, description: 'Saldo inicial en efectivo' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saldoInicial?: number;
}

export class ArqueoLineaDto {
  @ApiProperty({ example: 'EFECTIVO' })
  @IsString()
  @IsIn(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN'])
  metodoPago: string;
  @ApiProperty({ example: 1500.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoEsperado: number;
  @ApiProperty({ example: 1500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoContado: number;
}

export class CierreCajaDto {
  @ApiProperty({ example: 1500, description: 'Efectivo contado en caja' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  efectivoContado: number;

  @ApiProperty({ type: [ArqueoLineaDto], description: 'Arqueo por metodo de pago' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArqueoLineaDto)
  arqueo: ArqueoLineaDto[];
}
