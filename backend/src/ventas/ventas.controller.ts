import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CrearNotaDebitoDto } from './dto/crear-nota-debito.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SucursalGuard } from '../common/guards/sucursal.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';
import { IsString, MinLength } from 'class-validator';

class AnularVentaDto {
  @IsString()
  @MinLength(5)
  motivo: string;
}

@ApiTags('Ventas / Comprobantes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SucursalGuard)
@Controller('api/ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar una venta (factura/boleta) con calculo IGV y correlativo atomico' })
  create(@Body() dto: CreateVentaDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.ventasService.create(dto, user.sub, user.empresaId, user.sucursalIds || [], user.rol);
  }

  @Get()
  @ApiOperation({ summary: 'Listar comprobantes (filtrados por sucursal)' })
  listar(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursalId?: string) {
    const branchId = sucursalId ? Number(sucursalId) : undefined;
    return this.ventasService.findAll(user.empresaId, user.sucursalIds || [], branchId);
  }

  @Get('rentabilidad')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Reporte de ventas netas, costo promedio histórico y utilidad bruta por producto' })
  rentabilidad(
    @CurrentUser() user: UsuarioAutenticado,
    @Query('sucursalId') sucursal?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) throw new BadRequestException('Sucursal inválida');
    return this.ventasService.reporteRentabilidad(user.empresaId, user.sucursalIds || [], sucursalId, desde, hasta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un comprobante con sus lineas' })
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.ventasService.findOne(id, user.empresaId, user.sucursalIds || []);
  }

  @Post(':id/notas-debito')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registra nota de débito por aumento de valor y crea una cuenta por cobrar adicional' })
  notaDebito(@Param('id', ParseIntPipe) id: number, @Body() dto: CrearNotaDebitoDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.ventasService.crearNotaDebito(id, dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post(':id/anular')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Anular un comprobante (luego se envia Comunicacion de Baja RA)' })
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularVentaDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.ventasService.anular(id, user.sub, user.empresaId, user.sucursalIds || [], dto.motivo);
  }
}
