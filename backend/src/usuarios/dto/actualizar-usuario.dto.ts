import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { RolUsuarioEnum } from '../../common/enums';

export class ActualizarUsuarioDto {
  @IsOptional() @IsString() @Length(2, 200)
  nombre?: string;

  @IsOptional() @IsIn([RolUsuarioEnum.ADMIN, RolUsuarioEnum.CAJERO])
  rol?: RolUsuarioEnum;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsInt({ each: true }) @Min(1, { each: true })
  sucursalIds?: number[];
}

export class CambiarEstadoUsuarioDto {
  @IsIn([true, false])
  activo: boolean;
}

export class RestablecerPasswordDto {
  @IsString() @Length(8, 72)
  password: string;
}
