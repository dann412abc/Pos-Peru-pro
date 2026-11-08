import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SucursalesService } from './sucursales.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';

@ApiTags('Sucursales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/sucursales')
export class SucursalesController {
  constructor(private readonly service: SucursalesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar sucursales (filtradas por la empresa del usuario)' })
  listar(@CurrentUser() user: UsuarioAutenticado) {
    return this.service.findAll(user.empresaId);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) { return this.service.findOne(id, user.empresaId); }

  @Post()
  @Roles(RolUsuarioEnum.ADMIN)
  crear(@Body() body: any, @CurrentUser() user: UsuarioAutenticado) { return this.service.create(user.empresaId, body); }
}
