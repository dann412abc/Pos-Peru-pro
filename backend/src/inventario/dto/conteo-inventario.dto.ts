import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class AbrirConteoDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  sucursalId: number;
  @ApiProperty({ example: 'Inventario físico de cierre de mes' })
  @IsString() @MinLength(5) @MaxLength(200)
  observacion: string;
}
export class RegistrarConteoLineaDto {
  @ApiProperty({ example: 25 })
  @Type(() => Number) @IsInt() @Min(1)
  lineaId: number;
  @ApiProperty({ example: 10.5 })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  cantidadContada: number;
}
