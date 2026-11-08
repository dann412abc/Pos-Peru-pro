import { canAccessTenantScope } from './tenant-scope';

describe('canAccessTenantScope', () => {
  const user = { empresaId: 7, sucursalIds: [11, 12] };

  it('permite la misma empresa cuando no se solicita una sucursal concreta', () => {
    expect(canAccessTenantScope(user, { empresaId: 7 })).toBe(true);
  });

  it('permite una sucursal asignada', () => {
    expect(canAccessTenantScope(user, { empresaId: 7, sucursalId: 12 })).toBe(true);
  });

  it('rechaza otra empresa', () => {
    expect(canAccessTenantScope(user, { empresaId: 8, sucursalId: 11 })).toBe(false);
  });

  it('rechaza una sucursal no asignada', () => {
    expect(canAccessTenantScope(user, { empresaId: 7, sucursalId: 99 })).toBe(false);
  });

  it('rechaza usuario o identificadores inválidos', () => {
    expect(canAccessTenantScope(undefined, { empresaId: 7 })).toBe(false);
    expect(canAccessTenantScope(user, { empresaId: 0 })).toBe(false);
    expect(canAccessTenantScope(user, { empresaId: 7, sucursalId: -1 })).toBe(false);
  });
});
