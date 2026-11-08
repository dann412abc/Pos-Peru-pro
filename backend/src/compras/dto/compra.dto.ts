import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional,
  IsDateString, IsString, Length, Max, MaxLength, Min, Matches, ValidateNested,
} from 'class-validator';

export class LineaCompraDto {
  @Type(() => Number) @IsInt() @Min(1)
  productoId: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  varianteId?: number;

  /** Número de empaques adquiridos; el backend convierte a unidades de inventario. */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(999999)
  cantidad: number;

  /** Costo de compra unitario con IGV incluido, en soles (por unidad de inventario). */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(999999)
  costoUnitario: number;

  /** Datos del empaque de compra; cantidad siempre se expresa en empaques. */
  @IsOptional() @IsString() @MaxLength(20)
  unidadCompra?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(999999)
  unidadesPorEmpaque?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(99999999)
  costoEmpaque?: number;

  @Type(() => Number) @IsIn([10, 20, 30])
  tipoIgv: 10 | 20 | 30;

  @IsOptional() @IsString() @MaxLength(80)
  codigoLote?: string;

  @IsOptional() @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaVencimiento?: string;
}

export class PagoCompraDto {
  @IsIn(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'TRANSFERENCIA'])
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA';

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(99999999)
  monto: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  cajaId?: number;

  @IsOptional() @IsString() @MaxLength(120)
  referencia?: string;

  @IsOptional() @IsString() @Length(8, 100)
  idempotencyKey?: string;
}

export class CrearCompraDto {
  @Type(() => Number) @IsInt() @Min(1)
  sucursalId: number;

  @Type(() => Number) @IsInt() @Min(1)
  proveedorId: number;

  @IsIn(['01', '03', 'NV', 'OT'])
  tipoDocumento: '01' | '03' | 'NV' | 'OT';

  @IsOptional() @IsString() @MaxLength(12)
  serie?: string;

  @IsOptional() @IsString() @MaxLength(30)
  numero?: string;

  @IsOptional() @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaDocumento?: string;

  @IsIn(['CONTADO', 'CREDITO'])
  condicionPago: 'CONTADO' | 'CREDITO';

  @IsOptional() @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaVencimiento?: string;

  @IsString() @Length(8, 100)
  idempotencyKey: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => LineaCompraDto)
  lineas: LineaCompraDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => PagoCompraDto)
  pagos?: PagoCompraDto[];
}

export class RegistrarPagoCompraDto extends PagoCompraDto {}

export class AnularCompraDto {
  @IsString() @Length(5, 500)
  motivo: string;
}
