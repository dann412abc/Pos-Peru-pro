import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsuariosService } from '../usuarios/usuarios.service';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(username: string, password: string) {
    const usuario = await this.usuariosService.findByUsername(username);
    if (!usuario) throw new UnauthorizedException('Credenciales invalidas');
    const valido = await bcrypt.compare(password, usuario.passwordHash);
    if (!valido) throw new UnauthorizedException('Credenciales invalidas');

    const payload: JwtPayload = {
      sub: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      sucursalIds: usuario.sucursales?.map((s) => s.id) || [],
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessTtl') || '15m',
    });
    const refreshToken = this.jwtService.sign({ sub: usuario.id, tipo: 'refresh' }, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshTtl') || '7d',
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      usuario: {
        id: usuario.id,
        username: usuario.username,
        nombre: usuario.nombre,
        rol: usuario.rol,
        sucursalIds: payload.sucursalIds,
        sucursales: (usuario.sucursales || []).map((sucursal) => ({ id: sucursal.id, nombre: sucursal.nombre })),
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
      if (decoded.tipo !== 'refresh') throw new Error('Token no es de refresh');
      const usuario = await this.usuariosService.findById(decoded.sub);
      if (!usuario) throw new UnauthorizedException('Usuario invalido');
      const payload: JwtPayload = {
        sub: usuario.id, username: usuario.username, rol: usuario.rol,
        empresaId: usuario.empresaId, sucursalIds: usuario.sucursales?.map((s) => s.id) || [],
      };
      const accessToken = this.jwtService.sign(payload, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessTtl') || '15m',
      });
      return { accessToken, tokenType: 'Bearer' };
    } catch {
      throw new UnauthorizedException('Refresh token invalido o expirado');
    }
  }
}
