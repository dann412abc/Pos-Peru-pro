import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';

@ApiTags('Productos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/productos')
export class ProductosController {
  constructor(private readonly service: ProductosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos activos (precio incluye IGV)' })
  listar(@CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? user.sucursalIds?.[0] : Number(sucursal);
    if (!Number.isInteger(sucursalId) || !user.sucursalIds?.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a la sucursal solicitada');
    return this.service.findAll(user.empresaId, sucursalId);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? user.sucursalIds?.[0] : Number(sucursal);
    if (!Number.isInteger(sucursalId) || !user.sucursalIds?.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a la sucursal solicitada');
    return this.service.findOne(id, user.empresaId, sucursalId);
  }

  @Post()
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Crear producto (valida tipo IGV 10/20/30)' })
  crear(@Body() dto: CreateProductoDto, @CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? user.sucursalIds?.[0] : Number(sucursal);
    if (!Number.isInteger(sucursalId) || !user.sucursalIds?.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a la sucursal solicitada');
    return this.service.create(user.empresaId, user.sub, sucursalId, dto);
  }

  @Put(':id')
  @Roles(RolUsuarioEnum.ADMIN)
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateProductoDto, @CurrentUser() user: UsuarioAutenticado, @Query('sucursalId') sucursal?: string) {
    const sucursalId = sucursal === undefined ? user.sucursalIds?.[0] : Number(sucursal);
    if (!Number.isInteger(sucursalId) || !user.sucursalIds?.includes(sucursalId)) throw new ForbiddenException('No tiene acceso a la sucursal solicitada');
    return this.service.update(id, user.empresaId, body, sucursalId);
  }

  @Delete(':id')
  @Roles(RolUsuarioEnum.ADMIN)
  eliminar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) { return this.service.remove(id, user.empresaId); }
}
