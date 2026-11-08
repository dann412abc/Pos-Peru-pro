import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CategoriasService } from './categorias.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';

@ApiTags('Categorias')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/categorias')
export class CategoriasController {
  constructor(private readonly service: CategoriasService) {}
  @Get() listar(@CurrentUser() user: UsuarioAutenticado) { return this.service.findAll(user.empresaId); }
  @Get(':id') detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) { return this.service.findOne(id, user.empresaId); }
  @Post()
  @Roles(RolUsuarioEnum.ADMIN)
  crear(@Body('nombre') nombre: string, @CurrentUser() user: UsuarioAutenticado) { return this.service.create(user.empresaId, nombre); }
}
