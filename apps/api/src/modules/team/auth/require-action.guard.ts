import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TEAM_ACTION_KEY } from './require-action.decorator';
import { can, MemberAction } from '../permissions/permissions';
import { AuthenticatedMembership } from './require-member.guard';

/** Doit s'exécuter APRÈS RequireMemberGuard, qui pose `req.membership`. */
@Injectable()
export class RequireActionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<MemberAction | undefined>(TEAM_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return true;

    const request = context.switchToHttp().getRequest();
    const membership: AuthenticatedMembership | undefined = request.membership;
    if (!membership || !can(membership.role, action)) {
      throw new ForbiddenException(`Action non autorisée pour le rôle ${membership?.role ?? 'inconnu'}`);
    }
    return true;
  }
}
