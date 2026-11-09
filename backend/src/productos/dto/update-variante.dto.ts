import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateVarianteDto } from './create-variante.dto';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVarianteDto extends PartialType(OmitType(CreateVarianteDto, ['codigoBarras'] as const)) {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(80)
  codigoBarras?: string | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  activo?: boolean;
}
