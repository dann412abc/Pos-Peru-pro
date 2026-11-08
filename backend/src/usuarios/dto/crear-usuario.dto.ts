import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, Length, Matches, Min } from 'class-validator';
import { RolUsuarioEnum } from '../../common/enums';

export class CrearUsuarioDto {
  @IsString() @Length(3, 50) @Matches(/^[a-zA-Z0-9._-]+$/)
  username: string;

  @IsString() @Length(2, 200)
  nombre: string;

  @IsString() @Length(8, 72)
  password: string;

  @IsIn([RolUsuarioEnum.ADMIN, RolUsuarioEnum.CAJERO])
  rol: RolUsuarioEnum;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsInt({ each: true }) @Min(1, { each: true })
  sucursalIds: number[];
}
