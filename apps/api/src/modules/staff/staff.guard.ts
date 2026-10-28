import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole } from '@paybrain/database';
import { StaffAuthService } from './staff-auth.service';

export const STAFF_ROLES_KEY = 'staff_roles';

/**
 * Rôles internes (§M12) : Support = lecture seule ; Conformité = KYB et
 * suspension ; Super-administrateur = tout, y compris paliers et prix.
 * Toute route qui MODIFIE une donnée doit porter ce décorateur : le garde
 * refuse par défaut une écriture non annotée (filet de sécurité).
 */
export const RequireStaffRole = (...roles: StaffRole[]) => SetMetadata(STAFF_ROLES_KEY, roles);

/** Rôles autorisés à écrire, par domaine. */
export const STAFF_WRITE = {
  compliance: ['COMPLIANCE', 'SUPER_ADMIN'] as StaffRole[],
  admin: ['SUPER_ADMIN'] as StaffRole[],
};

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const authHeader: string = req.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Session du personnel requise');

    const payload = await this.auth.verifyToken(token);
    req.staffUser = payload;

    const required = this.reflector.getAllAndOverride<StaffRole[] | undefined>(STAFF_ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (required?.length) {
      if (!required.includes(payload.role)) throw new ForbiddenException('Action réservée à un autre rôle');
      return true;
    }
    // Écriture sans rôle déclaré : refusée (seule la lecture est ouverte à tous les agents).
    if (!READ_METHODS.has(req.method)) throw new ForbiddenException('Action réservée à un autre rôle');
    return true;
  }
}
