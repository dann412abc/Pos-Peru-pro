import { Body, Controller, Get, Param, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventarioService } from './inventario.service';
import { AjusteInventarioDto } from './dto/ajuste-inventario.dto';
import { TransferirInventarioDto } from './dto/transferir-inventario.dto';
import { TransferirVarianteDto } from './dto/transferir-variante.dto';
import { AjusteVarianteInventarioDto } from './dto/ajuste-variante-inventario.dto';
import { RegistrarMermaDto } from './dto/registrar-merma.dto';
import { AbrirConteoDto, RegistrarConteoLineaDto } from './dto/conteo-inventario.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';

@ApiTags('Inventario')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get('reportes/stock-valorizado')
  @ApiOperation({ summary: 'Inventario valorizado por sucursal, producto y variante' })
  stockValorizado(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const id = sucursal === undefined ? undefined : Number(sucursal);
    if (id !== undefined && (!Number.isInteger(id) || id <= 0)) throw new BadRequestException('Sucursal inválida');
    return this.inventarioService.reporteStockValorizado(user.empresaId, user.sucursalIds || [], id);
  }

  @Get('reportes/kardex/:productoId')
  @ApiOperation({ summary: 'Kardex de producto o variante por sucursales autorizadas' })
  kardex(@Param('productoId') raw: string, @CurrentUser() user: UsuarioAutenticado,
    @Query('varianteId') variante?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const productoId = Number(raw); const varianteId = variante === undefined ? undefined : Number(variante);
    return this.inventarioService.kardex(user.empresaId, user.sucursalIds || [], productoId, varianteId, desde, hasta);
  }

  @Get('inteligencia')
  @ApiOperation({ summary: 'Analizar stock, rotación, cobertura y sugerencias de reposición por sucursal' })
  inteligencia(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const id = sucursal === undefined ? undefined : Number(sucursal);
    if (id !== undefined && (!Number.isInteger(id) || id <= 0)) throw new BadRequestException('Sucursal inválida');
    return this.inventarioService.inteligenciaStock(user.empresaId, user.sucursalIds || [], id);
  }

  @Get('vencimientos')
  @ApiOperation({ summary: 'Alertas de lotes vencidos y próximos a vencer en sucursales autorizadas' })
  alertas(@CurrentUser() user:UsuarioAutenticado,@Query('dias') dias?:string) {
    const n=dias===undefined?30:Number(dias); if(!Number.isInteger(n)||n<0||n>365)throw new BadRequestException('El rango debe estar entre 0 y 365 días');
    return this.inventarioService.alertasVencimiento(user.empresaId,user.sucursalIds||[],n);
  }

  @Get('conteos')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Historial de inventarios físicos por sucursal autorizada' })
  listarConteos(@CurrentUser() user: UsuarioAutenticado) {
    return this.inventarioService.listarConteos(user.empresaId,user.sucursalIds||[]);
  }

  @Post('conteos')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Abrir inventario físico y tomar snapshot de productos y variantes' })
  abrirConteo(@Body() dto: AbrirConteoDto,@CurrentUser() user: UsuarioAutenticado) {
    return this.inventarioService.abrirConteo(dto,user.sub,user.empresaId,user.sucursalIds||[]);
  }

  @Get('conteos/:id')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Consultar detalle y líneas de un inventario físico' })
  detalleConteo(@Param('id') raw:string,@CurrentUser() user:UsuarioAutenticado) {
    const id=Number(raw);if(!Number.isInteger(id)||id<=0)throw new BadRequestException('Inventario inválido');
    return this.inventarioService.detalleConteo(user.empresaId,user.sucursalIds||[],id);
  }

  @Post('conteos/lineas/contar')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Guardar cantidad física contada de una línea' })
  contarLinea(@Body() dto:RegistrarConteoLineaDto,@CurrentUser() user:UsuarioAutenticado) {
    return this.inventarioService.registrarLineaConteo(dto,user.empresaId,user.sucursalIds||[]);
  }

  @Post('conteos/:id/cerrar')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Cerrar inventario y aplicar diferencias como movimientos auditados' })
  cerrarConteo(@Param('id') raw:string,@CurrentUser() user:UsuarioAutenticado) {
    const id=Number(raw);if(!Number.isInteger(id)||id<=0)throw new BadRequestException('Inventario inválido');
    return this.inventarioService.cerrarConteo(id,user.sub,user.empresaId,user.sucursalIds||[]);
  }

  @Get('lotes-disponibles')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Listar lotes con saldo positivo para registrar una merma' })
  lotesDisponibles(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const id = sucursal === undefined ? undefined : Number(sucursal);
    if (id !== undefined && (!Number.isInteger(id) || id <= 0)) throw new BadRequestException('Sucursal inválida');
    return this.inventarioService.listarLotesDisponibles(user.empresaId, user.sucursalIds || [], id);
  }

  @Get('mermas')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Historial de mermas y costo de inventario dado de baja' })
  listarMermas(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const id = sucursal === undefined ? undefined : Number(sucursal);
    if (id !== undefined && (!Number.isInteger(id) || id <= 0)) throw new BadRequestException('Sucursal inválida');
    return this.inventarioService.listarMermas(user.empresaId, user.sucursalIds || [], id);
  }

  @Post('mermas')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar merma de un lote, descontar inventario y guardar auditoría' })
  registrarMerma(@Body() dto: RegistrarMermaDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.inventarioService.registrarMerma(dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post('transferencias')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Transferir existencias entre dos sucursales autorizadas, con movimientos de salida y entrada' })
  transferir(@Body() dto: TransferirInventarioDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.inventarioService.transferir(dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post('transferencias/variantes')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Transferir stock de una presentación entre sucursales conservando lotes y costo' })
  transferirVariante(@Body() dto: TransferirVarianteDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.inventarioService.transferirVariante(dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Get('transferencias')
  @ApiOperation({ summary: 'Consultar las últimas transferencias entre sucursales asignadas al usuario' })
  listarTransferencias(@CurrentUser() user: UsuarioAutenticado) {
    return this.inventarioService.listarTransferencias(user.empresaId, user.sucursalIds || []);
  }

  @Get('movimientos')
  @ApiOperation({ summary: 'Consultar movimientos de inventario de las sucursales autorizadas' })
  listar(@CurrentUser() user: UsuarioAutenticado, @Query('productoId') productoId?: string) {
    const id = productoId === undefined ? undefined : Number(productoId);
    if (id !== undefined && (!Number.isInteger(id) || id <= 0)) throw new BadRequestException('productoId inválido');
    return this.inventarioService.listar(user.empresaId, user.sucursalIds || [], id);
  }


  @Get('variantes/:varianteId/stock')
  @ApiOperation({ summary: 'Consultar stock de una variante en una sucursal autorizada' })
  stockVariante(
    @Param('varianteId') varianteIdRaw: string,
    @Query('sucursalId') sucursalRaw: string,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    const varianteId = Number(varianteIdRaw);
    const sucursalId = Number(sucursalRaw);
    if (!Number.isInteger(varianteId) || varianteId <= 0 || !Number.isInteger(sucursalId) || sucursalId <= 0) {
      throw new BadRequestException('varianteId y sucursalId deben ser enteros positivos');
    }
    return this.inventarioService.consultarStockVariante(user.empresaId, varianteId, sucursalId, user.sucursalIds || []);
  }

  @Post('variantes/ajustes')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar entrada o salida de stock de una variante con auditoría e idempotencia' })
  ajustarStockVariante(@Body() dto: AjusteVarianteInventarioDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.inventarioService.ajustarStockVariante(dto, user.sub, user.empresaId, user.sucursalIds || []);
  }

  @Post('movimientos')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Registrar entrada o salida manual de stock con auditoría' })
  ajustar(@Body() dto: AjusteInventarioDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.inventarioService.ajustar(dto, user.sub, user.empresaId, user.sucursalIds || []);
  }
}
