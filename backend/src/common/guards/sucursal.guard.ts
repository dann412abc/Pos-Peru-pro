import { CanActivate, ExecutionContext, Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsuarioAutenticado } from '../decorators/current-user.decorator';

/**
 * RBAC por sucursal: verifica que la sucursal indicada (header x-sucursal-id
 * o query param sucursalId) este dentro de las sucursales accesibles por el usuario.
 */
@Injectable()
export class SucursalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as UsuarioAutenticado;
    if (!user) throw new ForbiddenException('Usuario no autenticado');

    const sucursalIdRaw = request.headers['x-sucursal-id'] || request.query.sucursalId || request.body?.sucursalId;
    // ADMIN puede no indicar sucursal (acceso global); CAJERO debe indicar una sucursal valida.
    if (sucursalIdRaw === undefined || sucursalIdRaw === null || sucursalIdRaw === '') {
      // Las operaciones que crean o cierran una venta/caja deben declarar sucursal.
      const ruta = request.baseUrl + (request.route?.path || request.path || '');
      if (request.method === 'POST' && (ruta === '/api/ventas' || ruta === '/api/caja/apertura')) {
        throw new BadRequestException('Debe indicar una sucursal válida');
      }
      return true; // Las lecturas sin sucursal se filtran por las sucursales del token.
    }
    const sucursalId = Number(sucursalIdRaw);
    if (!Number.isInteger(sucursalId) || sucursalId <= 0) {
      throw new BadRequestException('sucursalId invalido');
    }
    if (!user.sucursalIds.includes(sucursalId)) {
      throw new ForbiddenException(`El usuario no tiene acceso a la sucursal ${sucursalId}`);
    }
    return true;
  }
}
