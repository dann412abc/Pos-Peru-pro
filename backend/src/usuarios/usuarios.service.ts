import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { In, Repository } from 'typeorm';
import { RolUsuarioEnum } from '../common/enums';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Usuario } from './entities/usuario.entity';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Sucursal) private readonly sucursalRepo: Repository<Sucursal>,
  ) {}

  async findByUsername(username: string): Promise<Usuario | null> {
    return this.usuarioRepo.findOne({ where: { username, activo: true }, relations: ['sucursales'] });
  }

  async findById(id: number): Promise<Usuario | null> {
    return this.usuarioRepo.findOne({ where: { id, activo: true }, relations: ['sucursales'] });
  }

  /** Busca el usuario interno vinculado a un UUID verificado de Supabase Auth. */
  async findBySupabaseAuthUserId(authUserId: string): Promise<Usuario | null> {
    return this.usuarioRepo.findOne({
      where: { supabaseAuthUserId: authUserId, activo: true },
      relations: ['sucursales'],
    });
  }

  private seguro(usuario: Usuario) {
    return {
      id: usuario.id,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      activo: usuario.activo,
      createdAt: usuario.createdAt,
      sucursales: (usuario.sucursales || []).map((s) => ({ id: s.id, nombre: s.nombre })),
    };
  }

  async findAll(empresaId: number) {
    const usuarios = await this.usuarioRepo.find({ where: { empresaId }, relations: ['sucursales'], order: { username: 'ASC' } });
    return usuarios.map((usuario) => this.seguro(usuario));
  }

  async findSafeById(id: number) {
    const usuario = await this.findById(id);
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return this.seguro(usuario);
  }

  private async validarSucursales(empresaId: number, sucursalIds: number[]): Promise<Sucursal[]> {
    const ids = [...new Set((sucursalIds || []).map(Number))];
    if (!ids.length) throw new BadRequestException('Asigne al usuario al menos una sucursal.');
    const sucursales = await this.sucursalRepo.find({ where: { empresaId, id: In(ids) } });
    if (sucursales.length !== ids.length) {
      throw new BadRequestException('Una o más sucursales no existen o no pertenecen a esta empresa.');
    }
    return sucursales;
  }

  async crear(empresaId: number, data: {
    username: string; nombre: string; password: string; rol: RolUsuarioEnum; sucursalIds: number[];
  }) {
    const username = data.username.trim().toLowerCase();
    if (await this.usuarioRepo.findOne({ where: { username } })) {
      throw new ConflictException('El nombre de usuario ya está registrado.');
    }
    const sucursales = await this.validarSucursales(empresaId, data.sucursalIds);
    const usuario = this.usuarioRepo.create({
      username,
      nombre: data.nombre.trim(),
      passwordHash: await bcrypt.hash(data.password, 10),
      rol: data.rol,
      activo: true,
      empresaId,
      sucursales,
      supabaseAuthUserId: null,
    });
    return this.seguro(await this.usuarioRepo.save(usuario));
  }

  private async obtenerDeEmpresa(id: number, empresaId: number): Promise<Usuario> {
    const usuario = await this.usuarioRepo.findOne({ where: { id, empresaId }, relations: ['sucursales'] });
    if (!usuario) throw new NotFoundException('Usuario no encontrado en la empresa activa.');
    return usuario;
  }

  async actualizar(id: number, empresaId: number, actorId: number, data: {
    nombre?: string; rol?: RolUsuarioEnum; sucursalIds?: number[];
  }) {
    const usuario = await this.obtenerDeEmpresa(id, empresaId);
    if (id === actorId && data.rol && data.rol !== RolUsuarioEnum.ADMIN) {
      throw new ForbiddenException('No puede quitarse su propio rol de administrador.');
    }
    if (data.nombre !== undefined) usuario.nombre = data.nombre.trim();
    if (data.rol !== undefined) usuario.rol = data.rol;
    if (data.sucursalIds !== undefined) usuario.sucursales = await this.validarSucursales(empresaId, data.sucursalIds);
    return this.seguro(await this.usuarioRepo.save(usuario));
  }

  async cambiarEstado(id: number, empresaId: number, actorId: number, activo: boolean) {
    const usuario = await this.obtenerDeEmpresa(id, empresaId);
    if (!activo && id === actorId) throw new ForbiddenException('No puede desactivar su propia sesión de administrador.');
    if (!activo && usuario.activo && usuario.rol === RolUsuarioEnum.ADMIN) {
      const administradoresActivos = await this.usuarioRepo.count({ where: { empresaId, rol: RolUsuarioEnum.ADMIN, activo: true } });
      if (administradoresActivos <= 1) throw new BadRequestException('No se puede desactivar al último administrador activo de la empresa.');
    }
    usuario.activo = activo;
    return this.seguro(await this.usuarioRepo.save(usuario));
  }

  async restablecerPassword(id: number, empresaId: number, password: string) {
    const usuario = await this.obtenerDeEmpresa(id, empresaId);
    usuario.passwordHash = await bcrypt.hash(password, 10);
    await this.usuarioRepo.save(usuario);
    return { ok: true, usuarioId: usuario.id };
  }
}
