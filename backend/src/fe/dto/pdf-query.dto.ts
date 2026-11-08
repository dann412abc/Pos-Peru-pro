import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { FORMATOS_TICKET_VALIDOS, FormatoTicket } from '../pdf/generador-pdf.interface';

export class PdfQueryDto {
  @ApiPropertyOptional({ enum: FORMATOS_TICKET_VALIDOS, default: '80mm', description: 'Tamano de papel del representante impreso' })
  @IsOptional()
  @IsIn(FORMATOS_TICKET_VALIDOS)
  formato?: FormatoTicket;
}
