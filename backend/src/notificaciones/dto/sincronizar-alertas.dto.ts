import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Length, MaxLength, Matches, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AlertaOperativaDto {
  @IsString() @Length(3,160) @Matches(/^[a-zA-Z0-9:_-]+$/)
  clave: string;

  @IsIn(['critica','advertencia','info'])
  nivel: 'critica'|'advertencia'|'info';

  @IsString() @Length(2,60)
  categoria: string;

  @IsString() @Length(3,220)
  titulo: string;

  @IsString() @Length(1,1200)
  detalle: string;

  @IsString() @Length(1,160)
  destino: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  sucursalId?: number;
}

export class SincronizarAlertasDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => AlertaOperativaDto)
  alertas: AlertaOperativaDto[];
}
