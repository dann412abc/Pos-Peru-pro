import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { RolUsuarioEnum } from '../common/enums';
import { CreateVarianteDto } from './dto/create-variante.dto';
import { UpdateVarianteDto } from './dto/update-variante.dto';
import { ProductoVariantesService } from './producto-variantes.service';

@ApiTags('Variantes de productos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/productos/:productoId/variantes')
export class ProductoVariantesController {
  constructor(private readonly service: ProductoVariantesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar variantes de un producto' })
  listar(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Query('sucursalId') sucursalRaw: string,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    const sucursalId = Number(sucursalRaw);
    if (!Number.isInteger(sucursalId) || !user.sucursalIds?.includes(sucursalId)) {
      throw new ForbiddenException('No tiene acceso a la sucursal solicitada');
    }
    return this.service.listar(user.empresaId, productoId, sucursalId);
  }

  @Post()
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Crear variante con código y precio propios' })
  crear(@Param('productoId', ParseIntPipe) productoId: number, @Body() dto: CreateVarianteDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.crear(user.empresaId, productoId, dto);
  }

  @Put(':varianteId')
  @Roles(RolUsuarioEnum.ADMIN)
  actualizar(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Param('varianteId', ParseIntPipe) varianteId: number,
    @Body() dto: UpdateVarianteDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.actualizar(user.empresaId, productoId, varianteId, dto);
  }

  @Delete(':varianteId')
  @Roles(RolUsuarioEnum.ADMIN)
  desactivar(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Param('varianteId', ParseIntPipe) varianteId: number,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.desactivar(user.empresaId, productoId, varianteId);
  }
}


@ApiTags('Búsqueda de variantes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/productos/variantes')
export class ProductoVarianteLookupController {
  constructor(private readonly service: ProductoVariantesService) {}

  @Get('buscar')
  @ApiOperation({ summary: 'Buscar una variante por código interno o código de barras' })
  buscar(
    @Query('codigo') codigo: string,
    @Query('sucursalId') sucursalRaw: string,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    const sucursalId = Number(sucursalRaw);
    if (!codigo?.trim()) throw new BadRequestException('Indique el código de barras o código interno');
    if (!Number.isInteger(sucursalId) || !user.sucursalIds?.includes(sucursalId)) {
      throw new ForbiddenException('No tiene acceso a la sucursal solicitada');
    }
    return this.service.buscarPorCodigo(user.empresaId, sucursalId, codigo);
  }
}
