import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { FeService } from './fe.service';
import { ResumenDiarioService } from './resumen-diario.service';
import { ComunicacionBajaService } from './comunicacion-baja.service';
import { PdfQueryDto } from './dto/pdf-query.dto';
import { PDF_GENERADOR_TOKEN, GeneradorPdfInterface, FormatoTicket } from './pdf/generador-pdf.interface';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';
import { SucursalesService } from '../sucursales/sucursales.service';

@ApiTags('Facturacion Electronica')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/fe')
export class FeController {
  constructor(
    private readonly feService: FeService,
    private readonly resumenDiario: ResumenDiarioService,
    private readonly comunicacionBaja: ComunicacionBajaService,
    private readonly notificaciones: NotificacionesService,
    private readonly sucursalesService: SucursalesService,
    @Inject(PDF_GENERADOR_TOKEN) private readonly pdfGenerator: GeneradorPdfInterface,
  ) {}

  private async validarSucursalAutorizada(sucursalId: number, user: UsuarioAutenticado): Promise<void> {
    if (!Number.isInteger(sucursalId) || sucursalId <= 0 || !user.sucursalIds?.includes(sucursalId)) {
      throw new ForbiddenException('No tiene acceso a esta sucursal');
    }
    await this.sucursalesService.findOne(sucursalId, user.empresaId);
  }

  @Get('comprobantes')
  @ApiOperation({ summary: 'Lista los comprobantes electronicos de las sucursales autorizadas' })
  listar(@CurrentUser() user: UsuarioAutenticado) {
    return this.feService.findAll(user.empresaId, user.sucursalIds || []);
  }

  @Get('comprobantes/:id')
  @ApiOperation({ summary: 'Detalle de un comprobante electronico con todos sus eventos' })
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.feService.findOne(id, user.empresaId, user.sucursalIds || []);
  }

  @Get('comprobantes/:id/pdf')
  @ApiOperation({ summary: 'Descargar PDF representante del comprobante (formatos 58mm/80mm/A5)' })
  @ApiQuery({ name: 'formato', required: false, enum: ['58mm', '80mm', 'A5'], example: '80mm' })
  async descargarPdf(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PdfQueryDto,
    @CurrentUser() user: UsuarioAutenticado,
    @Res() res: Response,
  ) {
    const ce = await this.feService.findOne(id, user.empresaId, user.sucursalIds || []);
    const formato: FormatoTicket = (query.formato as FormatoTicket) || '80mm';
    const pdf = await this.pdfGenerator.generarPdf(ce, formato);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="comprobante-${ce.comprobanteId}-${formato}.pdf"`);
    res.send(pdf);
  }

  @Post('comprobantes/:comprobanteId/enviar')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Re-envia (encola) un comprobante a la OSE/SUNAT' })
  reenviar(@Param('comprobanteId', ParseIntPipe) comprobanteId: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.feService.reenviarComprobante(comprobanteId, user.empresaId, user.sucursalIds || []);
  }

  @Post('comprobantes/:comprobanteId/enviar-email')
  @ApiOperation({ summary: 'Enviar comprobante por email (usa el del cliente por defecto)' })
  async enviarEmail(
    @Param('comprobanteId', ParseIntPipe) comprobanteId: number,
    @Body() body: { email?: string },
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    await this.feService.validarAccesoComprobante(comprobanteId, user.empresaId, user.sucursalIds || []);
    return this.notificaciones.enviarEmail(comprobanteId, body?.email);
  }

  @Post('comprobantes/:comprobanteId/enviar-whatsapp')
  @ApiOperation({ summary: 'Enviar comprobante por WhatsApp (usa el telefono del cliente; formato 51+9digitos)' })
  async enviarWhatsapp(
    @Param('comprobanteId', ParseIntPipe) comprobanteId: number,
    @Body() body: { numero?: string },
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    await this.feService.validarAccesoComprobante(comprobanteId, user.empresaId, user.sucursalIds || []);
    return this.notificaciones.enviarWhatsapp(comprobanteId, body?.numero);
  }

  @Post('resumen-diario')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Genera y encola el Resumen Diario (RC) de una sucursal para una fecha' })
  async resumenDiarioPost(@Body() body: { sucursalId: number; fecha: string }, @CurrentUser() user: UsuarioAutenticado) {
    if (!body) throw new BadRequestException('Debe indicar sucursal y fecha');
    await this.validarSucursalAutorizada(Number(body.sucursalId), user);
    const fecha = new Date(body.fecha);
    if (!body.fecha || Number.isNaN(fecha.getTime())) throw new BadRequestException('Fecha de resumen inválida');
    return this.resumenDiario.generarResumenDiario(Number(body.sucursalId), user.empresaId, fecha);
  }

  @Post('comunicacion-baja')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Genera la Comunicacion de Baja (RA) para comprobantes anulados previamente' })
  async baja(
    @Body() body: { sucursalId: number; comprobanteIds: number[]; motivo: string },
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    if (!body) throw new BadRequestException('Debe indicar sucursal, comprobantes y motivo');
    await this.validarSucursalAutorizada(Number(body.sucursalId), user);
    return this.comunicacionBaja.generarComunicacionBaja(
      Number(body.sucursalId), user.empresaId, body.comprobanteIds, body.motivo,
    );
  }
}
