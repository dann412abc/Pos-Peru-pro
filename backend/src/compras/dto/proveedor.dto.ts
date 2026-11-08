import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, Matches } from 'class-validator';

export class ProveedorDto {
  @IsIn(['RUC', 'DNI', 'OTRO'])
  tipoDoc: 'RUC' | 'DNI' | 'OTRO';

  @IsString()
  @Length(1, 15)
  @Matches(/^[0-9A-Za-z-]+$/)
  numero: string;

  @IsString()
  @Length(2, 200)
  nombre: string;

  @IsOptional() @IsString() @MaxLength(300)
  direccion?: string;

  @IsOptional() @IsString() @MaxLength(30)
  telefono?: string;

  @IsOptional() @IsEmail() @MaxLength(160)
  email?: string;

  @IsOptional() @IsString() @MaxLength(120)
  contacto?: string;

  @IsOptional() @IsString() @MaxLength(500)
  observaciones?: string;
}
