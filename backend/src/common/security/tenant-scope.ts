/**
 * Reglas puras de aislamiento por empresa y sucursal.
 * No sustituye RLS: se usa como defensa adicional en endpoints explícitamente protegidos.
 */
export interface TenantScopeUser {
  empresaId: number;
  sucursalIds: number[];
}

export interface TenantScopeTarget {
  empresaId: number;
  sucursalId?: number | null;
}

export function canAccessTenantScope(
  user: TenantScopeUser | null | undefined,
  target: TenantScopeTarget,
): boolean {
  if (!user || !Number.isSafeInteger(user.empresaId) || user.empresaId <= 0) return false;
  if (!Number.isSafeInteger(target.empresaId) || target.empresaId <= 0) return false;
  if (user.empresaId !== target.empresaId) return false;

  if (target.sucursalId === undefined || target.sucursalId === null) return true;
  if (!Number.isSafeInteger(target.sucursalId) || target.sucursalId <= 0) return false;
  return Array.isArray(user.sucursalIds) && user.sucursalIds.includes(target.sucursalId);
}
