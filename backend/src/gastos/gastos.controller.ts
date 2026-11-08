import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { RolUsuarioEnum } from '../common/enums';
import { CrearGastoDto, PagarGastoDto } from './dto/gasto.dto';
import { GastosService } from './gastos.service';

@ApiTags('Gastos operativos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuarioEnum.ADMIN)
@Controller('api/gastos')
export class GastosController {
  constructor(private readonly service: GastosService) {}

  @Get('reportes/dashboard-gerencial')
  @ApiOperation({ summary: 'Panel gerencial consolidado: ventas, rentabilidad, inventario, cuentas, caja y tendencias' })
  dashboardGerencial(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) throw new BadRequestException('Sucursal inválida');
    return this.service.dashboardGerencial(user.empresaId,user.sucursalIds||[],sucursalId);
  }

  @Get('reportes/estado-resultados')
  @ApiOperation({ summary: 'Estado de resultados operativo por periodo y sucursal' })
  estadoResultados(
    @CurrentUser() user: UsuarioAutenticado,
    @Query('sucursalId') sucursal?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    if (sucursalId !== undefined && (!Number.isInteger(sucursalId) || sucursalId <= 0)) {
      throw new BadRequestException('Sucursal inválida');
    }
    return this.service.estadoResultados(user.empresaId,user.sucursalIds||[],sucursalId,desde,hasta);
  }

  @Get()
  @ApiOperation({ summary: 'Listar gastos por sucursal y periodo' })
  listar(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const sucursalId = sucursal === undefined ? undefined : Number(sucursal);
    return this.service.listar(user.empresaId,user.sucursalIds||[],sucursalId,desde,hasta);
  }

  @Post(':sucursalId')
  @ApiOperation({ summary: 'Registrar gasto operativo pendiente' })
  crear(@Param('sucursalId',ParseIntPipe) sucursalId:number,@Body() dto:CrearGastoDto,@CurrentUser() user:UsuarioAutenticado) {
    return this.service.crearEnSucursal(sucursalId,dto,String(user.sub),user.empresaId,user.sucursalIds||[]);
  }

  @Post(':id/pagar')
  @ApiOperation({ summary: 'Registrar pago de gasto pendiente' })
  pagar(@Param('id',ParseIntPipe) id:number,@Body() dto:PagarGastoDto,@CurrentUser() user:UsuarioAutenticado) {
    return this.service.pagar(id,dto,user.empresaId,user.sucursalIds||[]);
  }
}
