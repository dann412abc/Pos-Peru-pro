import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class LineaOrdenCompraDto {
  @Type(() => Number) @IsInt() @Min(1) productoId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) varianteId?: number;
  @IsString() @Length(1,240) descripcion: string;
  @IsOptional() @IsString() @MaxLength(80) codigo?: string;
  @Type(() => Number) @IsNumber({maxDecimalPlaces:3}) @Min(0.001) @Max(999999) cantidad: number;
  @Type(() => Number) @IsNumber({maxDecimalPlaces:4}) @Min(0) @Max(999999) costoUnitarioEstimado: number;
  @IsOptional() @IsString() @MaxLength(20) unidadCompra?: string;
  @IsOptional() @Type(() => Number) @IsIn([10,20,30]) tipoIgv?: 10|20|30;
}
export class CrearOrdenCompraDto {
  @Type(() => Number) @IsInt() @Min(1) sucursalId: number;
  @Type(() => Number) @IsInt() @Min(1) proveedorId: number;
  @IsOptional() @IsDateString() fechaEntregaEsperada?: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({each:true}) @Type(()=>LineaOrdenCompraDto)
  lineas: LineaOrdenCompraDto[];
}
