import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsuariosService } from '../usuarios/usuarios.service';

export interface JwtPayload {
  sub: number;
  username: string;
  rol: string;
  sucursalIds: number[];
  empresaId: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usuariosService: UsuariosService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtPayload) {
    const usuario = await this.usuariosService.findById(payload.sub);
    if (!usuario) throw new UnauthorizedException('Usuario no existe o esta inactivo');
    return {
      sub: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      sucursalIds: usuario.sucursales?.map((s) => s.id) || [],
    };
  }
}
