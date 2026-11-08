import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsNotEmpty, IsDateString,
  MaxLength, Min, ValidateNested, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MetodoPagoEnum, TipoDocClienteEnum } from '../../common/enums';

export class CreateVentaLineaDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  productoId: number;

  @ApiPropertyOptional({ example: 4, description: 'ID de variante. Si se omite, se vende el producto base.' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  varianteId?: number;

  @ApiProperty({ example: 2 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  cantidad: number;

  @ApiPropertyOptional({ example: 0, description: 'Descuento en soles para esta línea' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuento?: number;

  @ApiPropertyOptional({ description: 'Precio unitario (incluye IGV). Si se omite, se usa el precio registrado.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioUnitario?: number;
}

export class ClienteVentaDto {
  @ApiProperty({ enum: TipoDocClienteEnum, example: 'DNI' })
  @IsIn(['DNI', 'RUC'])
  tipoDoc: TipoDocClienteEnum;

  @ApiProperty({ example: '00000000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(11)
  numero: string;

  @ApiProperty({ example: 'CONSUMIDOR FINAL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  direccion?: string;
}

export class CreatePagoDto {
  @ApiProperty({ enum: ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO'] })
  @IsIn(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO'])
  metodo: MetodoPagoEnum;

  @ApiProperty({ example: 25 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  @ApiPropertyOptional({ example: 50, description: 'Dinero recibido (solo efectivo)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoRecibido?: number;
}

export class CreateVentaDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  sucursalId: number;

  @ApiPropertyOptional({ example: 1, description: 'ID de cliente existente en la empresa' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  clienteId?: number;

  @ApiPropertyOptional({ type: ClienteVentaDto, description: 'Datos para resolver o registrar al cliente cuando aún no tiene ID' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClienteVentaDto)
  cliente?: ClienteVentaDto;

  @ApiProperty({ enum: ['01', '03'], example: '03' })
  @IsIn(['01', '03'])
  tipo: string;

  @ApiPropertyOptional({ enum: ['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO'], example: 'EFECTIVO', description: 'Compatibilidad con clientes antiguos que envían un único medio de pago' })
  @IsOptional()
  @IsIn(['EFECTIVO', 'TARJETA', 'YAPE', 'PLIN', 'CREDITO'])
  metodoPago?: MetodoPagoEnum;

  @ApiPropertyOptional({ type: [CreatePagoDto], description: 'Uno o varios medios de pago. La suma debe coincidir con el total.' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePagoDto)
  pagos?: CreatePagoDto[];

  @ApiPropertyOptional({ example: 50, description: 'Compatibilidad con pago único en efectivo' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoRecibido?: number;

  @ApiPropertyOptional({ example: '2026-12-05', description: 'Fecha de vencimiento del saldo a crédito; por defecto 30 días' })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaVencimiento?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  descuentoGlobal?: number;

  @ApiPropertyOptional({ example: 'Promoción aprobada por gerencia', description: 'Motivo obligatorio cuando hay descuentos; solo ADMIN puede autorizar descuentos' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  motivoDescuento?: string;

  @ApiPropertyOptional({ example: '3c6b2f26-4bb9-4c67-bc8a-9e3b5a2ac7b9', description: 'Clave única para impedir ventas duplicadas al reintentar una sincronización' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @ApiProperty({ type: [CreateVentaLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVentaLineaDto)
  lineas: CreateVentaLineaDto[];
}
