import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsNotEmpty, Min, MaxLength, IsBoolean } from 'class-validator';

export class UpdateProductoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty()
  codigo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty()
  nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80)
  codigoBarras?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  tieneVariantes?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive()
  categoriaId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString()
  unidad?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  precio?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  precioMayoreo?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  stockMinimo?: number;
  @ApiPropertyOptional({ enum: [10, 20, 30] }) @IsOptional() @IsIn([10, 20, 30])
  tipoIgv?: number;
}
