import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TENANT_SCOPE_KEY, TenantScopeOptions } from '../decorators/tenant-scope.decorator';
import { canAccessTenantScope } from '../security/tenant-scope';

function readPositiveInteger(request: any, key: string): number | null {
  const raw = request?.params?.[key] ?? request?.query?.[key] ?? request?.body?.[key];
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && /^[1-9]\d*$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<TenantScopeOptions>(TENANT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Sin metadata no cambia el comportamiento de rutas existentes.
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    const empresaId = readPositiveInteger(request, options.empresaParam);
    const sucursalId = options.sucursalParam
      ? readPositiveInteger(request, options.sucursalParam)
      : undefined;

    if (empresaId === null || (options.sucursalParam && sucursalId === null)) {
      throw new ForbiddenException('Falta un ámbito de empresa o sucursal válido');
    }

    if (!canAccessTenantScope(user, { empresaId, sucursalId })) {
      throw new ForbiddenException('No tiene acceso a esta empresa o sucursal');
    }
    return true;
  }
}
