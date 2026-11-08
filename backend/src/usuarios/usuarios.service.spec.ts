import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { RolUsuarioEnum } from '../common/enums';

describe('UsuariosService - identidad y administración multiempresa', () => {
  const repository = { findOne: jest.fn(), find: jest.fn(), create: jest.fn((value) => value), save: jest.fn(), count: jest.fn() };
  const sucursalRepo = { find: jest.fn() };
  let service: UsuariosService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsuariosService(repository as any, sucursalRepo as any);
  });

  it('resuelve solo usuarios activos por UUID de Supabase Auth e incluye sucursales', async () => {
    const usuario = { id: 7, supabaseAuthUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', activo: true };
    repository.findOne.mockResolvedValue(usuario);

    await expect(service.findBySupabaseAuthUserId(usuario.supabaseAuthUserId)).resolves.toBe(usuario);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { supabaseAuthUserId: usuario.supabaseAuthUserId, activo: true },
      relations: ['sucursales'],
    });
  });

  it('devuelve null si el UUID no está vinculado', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findBySupabaseAuthUserId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).resolves.toBeNull();
  });

  it('no permite auto degradar el último administrador de la sesión', async () => {
    repository.findOne.mockResolvedValue({ id: 5, empresaId: 2, rol: RolUsuarioEnum.ADMIN, sucursales: [] });
    await expect(service.actualizar(5, 2, 5, { rol: RolUsuarioEnum.CAJERO })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no permite desactivar al último administrador activo', async () => {
    repository.findOne.mockResolvedValue({ id: 6, empresaId: 2, rol: RolUsuarioEnum.ADMIN, activo: true, sucursales: [] });
    repository.count.mockResolvedValue(1);
    await expect(service.cambiarEstado(6, 2, 5, false)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza sucursales que no pertenecen íntegramente a la empresa', async () => {
    repository.findOne.mockResolvedValue(null);
    sucursalRepo.find.mockResolvedValue([{ id: 10, empresaId: 2, nombre: 'Centro' }]);
    await expect(service.crear(2, {
      username: 'cajero2', nombre: 'Cajero Dos', password: 'clave-segura-22', rol: RolUsuarioEnum.CAJERO,
      sucursalIds: [10, 11],
    })).rejects.toThrow('Una o más sucursales no existen o no pertenecen a esta empresa.');
  });
});
