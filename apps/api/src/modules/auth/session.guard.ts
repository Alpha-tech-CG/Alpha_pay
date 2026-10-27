import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionService } from './session.service';

export interface AuthenticatedAppUser {
  id: string;
  sessionId: string;
}

/**
 * Authentifie un utilisateur du tableau de bord : `Authorization: Bearer <jeton
 * d'accès>`, session revérifiée à chaque requête (révocation immédiate).
 * Pose `req.appUser`. Précède RequireMemberGuard et RequireActionGuard.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const { userId, sessionId } = await this.sessions.authenticate(token);
    const user: AuthenticatedAppUser = { id: userId, sessionId };
    request.appUser = user;
    return true;
  }
}
