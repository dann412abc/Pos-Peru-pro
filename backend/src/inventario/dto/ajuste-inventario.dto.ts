import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsString, IsPositive, MaxLength, Min, MinLength } from 'class-validator';

export class AjusteInventarioDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  sucursalId: number;

  @ApiProperty({ example: 25 })
  @IsInt()
  @IsPositive()
  productoId: number;

  @ApiProperty({ enum: ['ENTRADA', 'SALIDA'], example: 'ENTRADA' })
  @IsIn(['ENTRADA', 'SALIDA'])
  tipo: 'ENTRADA' | 'SALIDA';

  @ApiProperty({ example: 12, description: 'Cantidad en unidades de inventario; admite hasta 3 decimales' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  cantidad: number;

  @ApiProperty({ example: 'Reposición por compra a proveedor' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  motivo: string;
}
