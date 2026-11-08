import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmpresasService } from './empresas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuarioEnum } from '../common/enums';
import { CurrentUser, UsuarioAutenticado } from '../common/decorators/current-user.decorator';
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto';

@ApiTags('Empresas (Tenants)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/empresas')
export class EmpresasController {
  constructor(private readonly service: EmpresasService) {}

  @Get()
  @ApiOperation({ summary: 'Listar empresas' })
  listar(@CurrentUser() user: UsuarioAutenticado) { return this.service.findAll(user.empresaId); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de empresa con sus sucursales' })
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UsuarioAutenticado) { return this.service.findOne(id, user.empresaId); }

  @Patch('actual')
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Actualizar datos fiscales y comerciales de la empresa activa' })
  actualizarActual(@Body() body: ActualizarEmpresaDto, @CurrentUser() user: UsuarioAutenticado) {
    return this.service.actualizar(user.empresaId, body);
  }

  @Post()
  @Roles(RolUsuarioEnum.ADMIN)
  @ApiOperation({ summary: 'Crear empresa (valida RUC de 11 digitos)' })
  crear(@Body() body: any) { return this.service.create(body); }
}
