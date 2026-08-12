import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protects routes with the JWT access-token strategy. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /** Map any auth failure (missing/invalid/expired token) to a clean 401. */
  handleRequest<T>(err: unknown, user: T): T {
    if (err || !user) throw new UnauthorizedException('Authentication required');
    return user;
  }
}
