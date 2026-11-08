import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { SincronizarAlertasDto } from './dto/sincronizar-alertas.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

class PruebaEmailDto { @IsEmail() destino: string; }
class PruebaWhatsappDto { @IsString() @Length(9, 16) @Matches(/^\+?[0-9]+$/) destino: string; }

@ApiTags('Notificaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}


  private exigirAdmin(user: UsuarioAutenticado) {
    if (user.rol !== 'ADMIN') throw new ForbiddenException('Solo el administrador puede gestionar alertas operativas');
  }

  @Get('operativas')
  @ApiOperation({ summary: 'Listar alertas operativas persistentes del administrador' })
  listarOperativas(@CurrentUser() user: UsuarioAutenticado) {
    this.exigirAdmin(user);
    return this.service.listarAlertas(user.empresaId, user.sub, user.sucursalIds || []);
  }

  @Post('operativas/sincronizar')
  @ApiOperation({ summary: 'Actualizar bandeja persistente con alertas operativas detectadas' })
  sincronizarOperativas(@CurrentUser() user: UsuarioAutenticado, @Body() dto: SincronizarAlertasDto) {
    this.exigirAdmin(user);
    return this.service.sincronizarAlertas(user.empresaId, user.sub, user.sucursalIds || [], dto.alertas || []);
  }

  @Patch('operativas/:id/leida')
  @ApiOperation({ summary: 'Marcar una alerta operativa como leída' })
  marcarLeida(@CurrentUser() user: UsuarioAutenticado, @Param('id', ParseIntPipe) id: number) {
    this.exigirAdmin(user);
    return this.service.marcarAlertaLeida(user.empresaId, user.sub, id);
  }

  @Patch('operativas/leidas')
  @ApiOperation({ summary: 'Marcar todas las alertas operativas como leídas' })
  marcarTodasLeidas(@CurrentUser() user: UsuarioAutenticado) {
    this.exigirAdmin(user);
    return this.service.marcarTodasLeidas(user.empresaId, user.sub);
  }


  @Get('configuracion')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Estado no sensible de los canales de notificación y facturación' })
  estadoConfiguracion(@CurrentUser() user: UsuarioAutenticado) {
    this.exigirAdmin(user);
    return this.service.obtenerEstadoConfiguracion();
  }

  @Post('prueba/email')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Enviar correo de prueba con el SMTP configurado en el backend' })
  async probarEmail(@CurrentUser() user: UsuarioAutenticado, @Body() dto: PruebaEmailDto) {
    this.exigirAdmin(user);
    const result = await this.service.probarEmail(dto.destino);
    if (!result.enviado) throw new BadRequestException(result.error || 'No se pudo enviar el correo de prueba');
    return { ok: true, destino: dto.destino, mensajeId: result.mensajeId };
  }

  @Post('prueba/whatsapp')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Enviar WhatsApp de prueba con la Cloud API configurada en el backend' })
  async probarWhatsapp(@CurrentUser() user: UsuarioAutenticado, @Body() dto: PruebaWhatsappDto) {
    this.exigirAdmin(user);
    const result = await this.service.probarWhatsapp(dto.destino);
    if (!result.enviado) throw new BadRequestException(result.error || 'No se pudo enviar el WhatsApp de prueba');
    return { ok: true, destino: result.numeroFormateado };
  }

  @Get('envios')
  @ApiOperation({ summary: 'Historial de envios de comprobantes por email/WhatsApp' })
  listar(@CurrentUser() user: UsuarioAutenticado, @Query('comprobanteId') comprobanteId?: string) {
    const id = comprobanteId === undefined ? undefined : Number(comprobanteId);
    if (id !== undefined && (!Number.isInteger(id) || id <= 0)) throw new BadRequestException('comprobanteId inválido');
    return this.service.findAll(user.empresaId, user.sucursalIds || [], id);
  }
}
