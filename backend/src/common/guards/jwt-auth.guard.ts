import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guard de autenticacion JWT (access token). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
