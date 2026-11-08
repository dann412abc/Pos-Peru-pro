import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class ActualizarEmpresaDto {
  @IsOptional() @IsString() @Matches(/^\d{11}$/)
  ruc?: string;

  @IsOptional() @IsString() @Length(2, 200)
  razonSocial?: string;

  @IsOptional() @IsString() @Length(0, 200)
  nombreComercial?: string;

  @IsOptional() @IsString() @Length(2, 300)
  direccion?: string;

  @IsOptional() @IsString() @Matches(/^\d{6}$/)
  ubigeo?: string;

  @IsOptional() @IsString() @Length(2, 100)
  departamento?: string;

  @IsOptional() @IsString() @Length(2, 100)
  provincia?: string;

  @IsOptional() @IsString() @Length(2, 100)
  distrito?: string;
}
