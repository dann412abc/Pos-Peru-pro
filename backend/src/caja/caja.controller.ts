import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CajaService } from './caja.service';
import { AperturaCajaDto, CierreCajaDto } from './dto/apertura-caja.dto';
import { CajaMovimientoDto } from './dto/caja-movimiento.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { SucursalGuard } from '../common/guards/sucursal.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';

@ApiTags('Caja')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SucursalGuard)
@Controller('api/caja')
export class CajaController {
  constructor(private readonly cajaService: CajaService) {}

  @Post('apertura')
  @ApiOperation({ summary: 'Aperturar caja (saldo inicial). Solo una abierta por sucursal+usuario.' })
  abrir(@Body() dto: AperturaCajaDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.cajaService.abrir(dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post(':id/cierre')
  @ApiOperation({ summary: 'Cerrar caja con arqueo por metodo de pago y calculo de diferencia' })
  cerrar(@Param('id', ParseIntPipe) id: number, @Body() dto: CierreCajaDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.cajaService.cerrar(id, dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post(':id/movimientos')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar ingreso o egreso de una caja abierta (solo ADMIN)' })
  registrarMovimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CajaMovimientoDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cajaService.registrarMovimiento(id, dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Get(':id/movimientos')
  @ApiOperation({ summary: 'Listar ingresos y egresos de una caja' })
  listarMovimientos(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.cajaService.listarMovimientos(id, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Get(':id/resumen')
  @ApiOperation({ summary: 'Resumen del turno de caja completo para arqueo' })
  resumen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.cajaService.resumen(id, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Get('reportes/flujo')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Flujo financiero diario de ventas y movimientos de caja por sucursal' })
  reporteFlujo(
    @Query('sucursalId') sucursal: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.cajaService.reporteFlujoCaja(Number(sucursal), desde, hasta, user.empresaId, user.sucursalIds || []);
  }

  @Get('estado')
  @ApiOperation({ summary: 'Obtener la caja abierta actual del usuario en una sucursal' })
  estado(@Query('sucursalId') sucursalId: string, @CurrentUser() user: UsuarioAutenticado) {
    return this.cajaService.estadoActual(Number(sucursalId), user.sub, user.empresaId, user.sucursalIds || []);
  }
}
