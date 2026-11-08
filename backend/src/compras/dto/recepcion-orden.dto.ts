import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

class LineaRecepcionOrdenDto {
  @Type(() => Number) @IsInt() @Min(1) ordenLineaId: number;
  @Type(() => Number) @IsNumber({maxDecimalPlaces:3}) @Min(0.001) @Max(999999) cantidad: number;
  @IsOptional() @IsString() @MaxLength(80) codigoLote?: string;
  @IsOptional() @Type(() => Number) @IsNumber({maxDecimalPlaces:4}) @Min(0.0001) @Max(999999) costoUnitario?: number;
  @IsOptional() @IsDateString() fechaVencimiento?: string;
}
export class RecepcionarOrdenCompraDto {
  @IsString() @Length(8,100) idempotencyKey: string;
  @IsIn(['01','03','NV','OT']) tipoDocumento: '01'|'03'|'NV'|'OT';
  @IsOptional() @IsString() @MaxLength(12) serie?: string;
  @IsOptional() @IsString() @MaxLength(30) numero?: string;
  @IsOptional() @IsDateString() fechaDocumento?: string;
  @IsOptional() @IsDateString() fechaVencimiento?: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({each:true}) @Type(()=>LineaRecepcionOrdenDto)
  lineas: LineaRecepcionOrdenDto[];
}
