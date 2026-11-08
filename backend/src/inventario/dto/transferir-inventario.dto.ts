import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsNumber,
  IsOptional, IsPositive, IsString, MaxLength, ValidateNested,
} from 'class-validator';

class LineaTransferenciaDto {
  @ApiProperty({ example: 12 })
  @Type(() => Number) @IsInt() @IsPositive()
  productoId: number;

  @ApiProperty({ example: 8, description: 'Cantidad con máximo tres decimales' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive()
  cantidad: number;
}

export class TransferirInventarioDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number) @IsInt() @IsPositive()
  sucursalOrigenId: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number) @IsInt() @IsPositive()
  sucursalDestinoId: number;

  @ApiProperty({ type: [LineaTransferenciaDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LineaTransferenciaDto)
  lineas: LineaTransferenciaDto[];

  @ApiProperty({ example: 'Reposición de mercadería entre locales' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  motivo: string;

  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional() @IsString() @MaxLength(100)
  idempotencyKey?: string;
}
