import {
  Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Put,
  Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ComprasService } from './compras.service';
import { DevolucionProveedorDto } from './dto/devolucion-proveedor.dto';
import { ProveedorDto } from './dto/proveedor.dto';
import { AnularCompraDto, CrearCompraDto, RegistrarPagoCompraDto } from './dto/compra.dto';
import { CrearOrdenCompraDto } from './dto/orden-compra.dto';
import { RecepcionarOrdenCompraDto } from './dto/recepcion-orden.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';

@ApiTags('Compras y proveedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/compras')
export class ComprasController {
  constructor(private readonly service: ComprasService) {}

  @Get('proveedores')
  listarProveedores(@CurrentUser() user: UsuarioAutenticado, @Query('incluirInactivos') incluir?: string) {
    return this.service.listarProveedores(user.empresaId, incluir === 'true' && user.rol === RolUsuarioEnum.ADMIN);
  }

  @Get('proveedores/analisis')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Analizar compras, devoluciones, cumplimiento y precios históricos por proveedor' })
  analisisProveedores(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) throw new ForbiddenException('Sucursal inválida');
    return this.service.analisisProveedores(user.empresaId, user.sucursalIds || [], sucursalId);
  }

  @Post('proveedores')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar proveedor de la empresa' })
  crearProveedor(@Body() dto: ProveedorDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.crearProveedor(user.empresaId, dto);
  }

  @Put('proveedores/:id')
  @Roles(RolUsuarioEnum.ADMIN)
  actualizarProveedor(@Param('id', ParseIntPipe) id: number, @Body() dto: ProveedorDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.actualizarProveedor(id, user.empresaId, dto);
  }

  @Delete('proveedores/:id')
  @Roles(RolUsuarioEnum.ADMIN)
  desactivarProveedor(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.desactivarProveedor(id, user.empresaId);
  }

  @Get('cajas-abiertas')
  listarCajasAbiertas(@Query('sucursalId') sucursal: string, @CurrentUser() user: UsuarioAutenticado) {
    const sucursalId = Number(sucursal);
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) throw new ForbiddenException('Debe indicar una sucursal válida');
    return this.service.cajasAbiertas(sucursalId, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Get('ordenes')
  listarOrdenes(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) throw new ForbiddenException('Sucursal inválida');
    return this.service.listarOrdenesCompra(user.empresaId,user.sucursalIds||[],sucursalId);
  }

  @Post('ordenes')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Crear orden de compra a proveedor' })
  crearOrden(@Body() dto: CrearOrdenCompraDto,@CurrentUser() user: UsuarioAutenticado) {
    return this.service.crearOrdenCompra(dto,user.sub,user.empresaId,user.sucursalIds||[]);
  }

  @Get('ordenes/:id')
  detalleOrden(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:UsuarioAutenticado) {
    return this.service.obtenerOrdenCompra(id,user.empresaId,user.sucursalIds||[]);
  }

  @Post('ordenes/:id/recepciones')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar recepción parcial o total y generar la compra real que actualiza inventario' })
  recepcionarOrden(@Param('id',ParseIntPipe) id:number,@Body() dto:RecepcionarOrdenCompraDto,@CurrentUser() user:UsuarioAutenticado) {
    return this.service.recepcionarOrdenCompra(id,dto,user.sub,user.empresaId,user.sucursalIds||[]);
  }

  @Post('ordenes/:id/enviar')
  @Roles(RolUsuarioEnum.ADMIN)
  enviarOrden(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:UsuarioAutenticado) {
    return this.service.cambiarEstadoOrdenCompra(id,'ENVIADA',user.empresaId,user.sucursalIds||[]);
  }

  @Post('ordenes/:id/cancelar')
  @Roles(RolUsuarioEnum.ADMIN)
  cancelarOrden(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:UsuarioAutenticado) {
    return this.service.cambiarEstadoOrdenCompra(id,'CANCELADA',user.empresaId,user.sucursalIds||[]);
  }

  @Get('sugerencias-reposicion')
  @ApiOperation({ summary: 'Sugerir reposición según ventas reales de los últimos 30 días y cobertura objetivo de 14 días' })
  sugerenciasReposicion(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) throw new ForbiddenException('Sucursal inválida');
    return this.service.sugerenciasReposicion(user.empresaId, user.sucursalIds || [], sucursalId);
  }

  @Get('cuentas-por-pagar')
  @ApiOperation({ summary: 'Consultar saldos pendientes con proveedores por sucursal' })
  cuentasPorPagar(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) throw new ForbiddenException('Sucursal inválida');
    return this.service.cuentasPorPagar(user.empresaId, user.sucursalIds || [], sucursalId);
  }

  @Get()
  listar(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) throw new ForbiddenException('Sucursal inválida');
    return this.service.listarCompras(user.empresaId, user.sucursalIds || [], sucursalId);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.obtenerDetalle(id, user.empresaId, user.sucursalIds || []);
  }

  @Post()
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar compra, recibir mercadería y actualizar costo promedio y stock de la sucursal' })
  crear(@Body() dto: CrearCompraDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.crearCompra(dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post(':id/pagos')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar pago parcial o total a proveedor y actualizar caja cuando corresponda' })
  registrarPago(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarPagoCompraDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.registrarPago(id, dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post(':id/anular')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Anular compra no pagada cuando el inventario puede revertirse sin afectar movimientos posteriores' })
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularCompraDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.anularCompra(id, dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post(':id/devoluciones')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Devolver mercadería al proveedor, descontar lote y aplicar nota de crédito a cuentas por pagar' })
  devolver(@Param('id',ParseIntPipe) id:number,@Body() dto:DevolucionProveedorDto,@CurrentUser() user:UsuarioAutenticado) {
    return this.service.devolverProveedor(id,dto,user.sub,user.empresaId,user.sucursalIds||[]);
  }
}
