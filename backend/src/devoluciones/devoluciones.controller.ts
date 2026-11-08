import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevolucionesService } from './devoluciones.service';
import { CrearDevolucionVentaDto } from './dto/crear-devolucion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';

@ApiTags('Devoluciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/devoluciones')
export class DevolucionesController {
  constructor(private readonly service: DevolucionesService) {}

  @Get()
  @ApiOperation({ summary: 'Historial de devoluciones de ventas por sucursal' })
  listar(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) {
      throw new BadRequestException('Sucursal inválida');
    }
    return this.service.listar(user.empresaId, user.sucursalIds || [], sucursalId);
  }

  @Get('ventas/buscar')
  @ApiOperation({ summary: 'Buscar comprobantes de venta antiguos por serie, número, cliente o documento' })
  buscarComprobantes(
    @CurrentUser() user: UsuarioAutenticado,
    @Query('q') q: string,
    @Query('sucursalId') sucursal?: string,
  ) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) {
      throw new BadRequestException('Sucursal inválida');
    }
    return this.service.buscarComprobantes(q, user.empresaId, user.sucursalIds || [], sucursalId);
  }

  @Get('ventas/:comprobanteId/disponibilidad')
  @ApiOperation({ summary: 'Ver líneas, cantidades y montos aún disponibles para devolver' })
  disponibilidad(@Param('comprobanteId', ParseIntPipe) comprobanteId: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.disponibilidad(comprobanteId, user.empresaId, user.sucursalIds || []);
  }

  @Post('ventas/:comprobanteId')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar devolución parcial o total, con ajuste de crédito y reembolso trazable' })
  crear(
    @Param('comprobanteId', ParseIntPipe) comprobanteId: number,
    @Body() dto: CrearDevolucionVentaDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.crear(comprobanteId, dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.detalle(id, user.empresaId, user.sucursalIds || []);
  }

  @Post(':id/nota-credito')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Genera nota de crédito vinculada a una devolución ya contabilizada' })
  emitirNotaCredito(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.emitirNotaCredito(id, user.sub, user.empresaId, user.sucursalIds || []);
  }
}
