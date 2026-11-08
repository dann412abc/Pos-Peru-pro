import { SetMetadata } from '@nestjs/common';

export const TENANT_SCOPE_KEY = 'tenant_scope';
export interface TenantScopeOptions {
  /** Nombre del parámetro en params, query o body. Obligatorio. */
  empresaParam: string;
  /** Nombre del parámetro de sucursal en params, query o body. Opcional. */
  sucursalParam?: string;
}

/** Protege una ruta contra IDs de empresa/sucursal ajenos al usuario autenticado. */
export const TenantScope = (options: TenantScopeOptions) =>
  SetMetadata(TENANT_SCOPE_KEY, options);
