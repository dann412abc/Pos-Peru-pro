import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min, MaxLength, IsBoolean } from 'class-validator';

export class CreateProductoDto {
  @ApiProperty({ example: 'P011' })
  @IsString() @IsNotEmpty()
  codigo: string;

  @ApiPropertyOptional({ example: '7750123456789' })
  @IsOptional() @IsString() @MaxLength(80)
  codigoBarras?: string;

  @ApiPropertyOptional({ default: false, description: 'Si es true, precio y stock se administran por presentación' })
  @IsOptional() @IsBoolean()
  tieneVariantes?: boolean;

  @ApiProperty({ example: 'Galleta Chocolate' })
  @IsString() @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt() @IsPositive()
  categoriaId?: number;

  @ApiPropertyOptional({ example: 'NIU', default: 'NIU' })
  @IsOptional() @IsString()
  unidad?: string;

  @ApiProperty({ example: 2.5, description: 'Precio INCLUYE IGV' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  precio: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  precioMayoreo?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  stock?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  stockMinimo?: number;

  @ApiProperty({ enum: [10, 20, 30], description: '10=gravado, 20=exonerado, 30=inafecto' })
  @IsIn([10, 20, 30])
  tipoIgv: number;
}
