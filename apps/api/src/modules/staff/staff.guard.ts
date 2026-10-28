import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole } from '@paybrain/database';
import { StaffAuthService } from './staff-auth.service';

export const STAFF_ROLES_KEY = 'staff_roles';
export const RequireStaffRole = (...roles: StaffRole[]) =>
  (target: any, key?: any, descriptor?: any) => {
    const Reflect = (globalThis as any).Reflect;
    Reflect.defineMetadata(STAFF_ROLES_KEY, roles, descriptor?.value ?? target);
    return descriptor ?? target;
  };

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const authHeader: string = req.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) throw new UnauthorizedException('Jeton personnel requis');

    const payload = await this.auth.verifyToken(token);
    req.staffUser = payload;

    // Vérification des rôles si annotés
    const handler = ctx.getHandler();
    const cls = ctx.getClass();
    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(STAFF_ROLES_KEY, [handler, cls]);
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(payload.role)) {
        throw new UnauthorizedException(`Rôle requis : ${requiredRoles.join(' ou ')}`);
      }
    }
    return true;
  }
}
