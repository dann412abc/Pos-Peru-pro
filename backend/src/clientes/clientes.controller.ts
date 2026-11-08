import {
  Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { RegistrarCobroClienteDto } from './dto/registrar-cobro-cliente.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';

@ApiTags('Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/clientes')
export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  @Get('cuentas-por-cobrar/resumen')
  @ApiOperation({ summary: 'Resumen de cartera vencida y por vencer de las sucursales autorizadas' })
  resumenCuentasPorCobrar(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    return this.service.resumenCuentasPorCobrar(user.empresaId, user.sucursalIds || [], sucursalId);
  }

  @Get('cuentas-por-cobrar')
  @ApiOperation({ summary: 'Listar cuentas por cobrar abiertas o filtradas por estado' })
  listarCuentasPorCobrar(
    @CurrentUser() user: UsuarioAutenticado,
    @Query('sucursalId') sucursal?: string,
    @Query('estado') estado?: string,
  ) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    return this.service.listarCuentasPorCobrar(user.empresaId, user.sucursalIds || [], sucursalId, estado);
  }

  @Get('cuentas-por-cobrar/:id')
  @ApiOperation({ summary: 'Ver detalle e historial de pagos de una cuenta por cobrar' })
  detalleCuentaPorCobrar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.detalleCuentaPorCobrar(id, user.empresaId, user.sucursalIds || []);
  }

  @Post('cuentas-por-cobrar/:id/cobros')
  @ApiOperation({ summary: 'Aplicar un cobro parcial o total con registro idempotente y movimiento de caja' })
  registrarCobro(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarCobroClienteDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.registrarCobro(id, dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Get()
  listar(@CurrentUser() user: UsuarioAutenticado) { return this.service.findAll(user.empresaId); }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) { return this.service.findOne(id, user.empresaId); }

  @Put(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateClienteDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.update(id, user.empresaId, dto);
  }

  @Post()
  @ApiOperation({ summary: 'Crear cliente (valida DNI 8 digitos / RUC 11 digitos)' })
  crear(@Body() dto: CreateClienteDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.create(user.empresaId, dto);
  }
}
