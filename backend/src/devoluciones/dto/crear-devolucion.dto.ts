import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional,
  IsString, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class LineaDevolucionDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 0 }) @Min(1)
  comprobanteLineaId: number;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(999999)
  cantidad: number;

  @IsBoolean()
  reingresarStock: boolean;
}

export class PagoDevolucionDto {
  @IsIn(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN'])
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN';

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999)
  monto: number;

  @IsOptional() @IsString() @MaxLength(120)
  referencia?: string;
}

export class CrearDevolucionVentaDto {
  @IsString() @Length(5, 500)
  motivo: string;

  @IsString() @Length(8, 100)
  idempotencyKey: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => LineaDevolucionDto)
  lineas: LineaDevolucionDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(4)
  @ValidateNested({ each: true }) @Type(() => PagoDevolucionDto)
  pagos?: PagoDevolucionDto[];
}
