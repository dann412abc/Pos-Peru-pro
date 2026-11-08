import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ActualizarUsuarioDto, CambiarEstadoUsuarioDto, RestablecerPasswordDto } from './dto/actualizar-usuario.dto';

@ApiTags('Usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Listar usuarios de la empresa sin exponer hashes ni UUID de identidad' })
  listar(@CurrentUser() user: UsuarioAutenticado) {
    return this.usuariosService.findAll(user.empresaId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  me(@CurrentUser() user: UsuarioAutenticado) {
    return this.usuariosService.findSafeById(user.sub);
  }

  @Post()
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Crear usuario ADMIN o CAJERO y asignar sucursales de la empresa' })
  crear(@Body() dto: CrearUsuarioDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.usuariosService.crear(user.empresaId, dto);
  }

  @Patch(':id')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Actualizar nombre, rol y sucursales de un usuario de la empresa' })
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarUsuarioDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.usuariosService.actualizar(id, user.empresaId, user.sub, dto);
  }

  @Patch(':id/estado')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Activar o desactivar usuario sin borrar su historial' })
  cambiarEstado(@Param('id', ParseIntPipe) id: number, @Body() dto: CambiarEstadoUsuarioDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.usuariosService.cambiarEstado(id, user.empresaId, user.sub, dto.activo);
  }

  @Patch(':id/password')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Restablecer contraseña de un usuario de la empresa' })
  restablecerPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: RestablecerPasswordDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.usuariosService.restablecerPassword(id, user.empresaId, dto.password);
  }
}
