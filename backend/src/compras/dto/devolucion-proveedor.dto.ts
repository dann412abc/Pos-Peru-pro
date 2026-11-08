import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
export class LineaDevolucionProveedorDto {
  @Type(() => Number) @IsInt() @Min(1) compraLineaId: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(999999) cantidad: number;
}
export class DevolucionProveedorDto {
  @IsString() @Length(5,500) motivo: string;
  @IsString() @Length(8,100) idempotencyKey: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(() => LineaDevolucionProveedorDto)
  lineas: LineaDevolucionProveedorDto[];
}
