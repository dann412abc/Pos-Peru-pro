import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVarianteDto {
  @ApiProperty({ example: 'GALLETA-CHOC-6' })
  @IsString() @IsNotEmpty() @MaxLength(60)
  codigo: string;

  @ApiProperty({ example: 'Paquete x 6 unidades' })
  @IsString() @IsNotEmpty() @MaxLength(120)
  nombre: string;

  @ApiProperty({ example: 5.5, description: 'Precio final con IGV incluido' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  precio: number;

  @ApiPropertyOptional({ example: '7750123456789' })
  @IsOptional() @IsString() @MaxLength(80)
  codigoBarras?: string;

  @ApiPropertyOptional({ example: 5.0 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  precioMayoreo?: number;
}
