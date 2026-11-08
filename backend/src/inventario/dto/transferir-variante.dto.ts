import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, IsNotEmpty, IsPositive, MaxLength } from 'class-validator';

export class TransferirVarianteDto {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @IsPositive() sucursalOrigenId: number;
  @ApiProperty({ example: 2 }) @Type(() => Number) @IsInt() @IsPositive() sucursalDestinoId: number;
  @ApiProperty({ example: 15 }) @Type(() => Number) @IsInt() @IsPositive() varianteId: number;
  @ApiProperty({ example: 6 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() cantidad: number;
  @ApiProperty({ example: 'Reposición de presentación' }) @IsString() @IsNotEmpty() @MaxLength(200) motivo: string;
  @ApiProperty({ required: false, maxLength: 100 }) @IsOptional() @IsString() @MaxLength(100) idempotencyKey?: string;
}
