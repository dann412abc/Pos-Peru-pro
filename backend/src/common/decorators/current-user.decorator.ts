import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UsuarioAutenticado {
  sub: number;
  username: string;
  rol: string;
  sucursalIds: number[];
  empresaId: number;
}

/** Extrae el usuario autenticado del request (inyectado por JwtStrategy). */
export const CurrentUser = createParamDecorator(
  (data: keyof UsuarioAutenticado | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UsuarioAutenticado;
    return data ? user?.[data] : user;
  },
);
