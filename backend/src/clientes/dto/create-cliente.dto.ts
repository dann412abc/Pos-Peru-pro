import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateClienteDto {
  @ApiProperty({ enum: ['DNI', 'RUC'] })
  @IsIn(['DNI', 'RUC'])
  tipoDoc: 'DNI' | 'RUC';

  @ApiProperty({ example: '00000000' })
  @IsString() @IsNotEmpty()
  numero: string;

  @ApiProperty({ example: 'CONSUMIDOR FINAL' })
  @IsString() @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  direccion?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  telefono?: string;

  @ApiPropertyOptional({ description: 'Email del cliente (para envio de comprobante)' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  limiteCredito?: number;
}
