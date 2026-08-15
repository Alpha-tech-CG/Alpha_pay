import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { decryptField } from '../../../common/security/pii-crypto';
import { UsersService } from '../../users/users.service';

export interface AuthenticatedAppUser {
  id: string;
  clerkUserId: string;
  email: string | null;
}

/**
 * Vérifie le token de session Clerk (Authorization: Bearer <token>) via le
 * SDK officiel `@clerk/backend` — décision 1A du handoff Team Members.
 * Pose `req.appUser`. Doit s'exécuter AVANT RequireMemberGuard.
 */
@Injectable()
export class ClerkSessionGuard implements CanActivate {
  private readonly logger = new Logger(ClerkSessionGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const auth: string | undefined = request.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de session manquant');
    }

    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) {
      this.logger.error('CLERK_SECRET_KEY non configuré — accès refusé');
      throw new UnauthorizedException();
    }

    const token = auth.slice(7);
    let clerkUserId: string;
    try {
      const payload = await verifyToken(token, { secretKey });
      clerkUserId = payload.sub;
    } catch (err) {
      throw new UnauthorizedException('Session Clerk invalide ou expirée');
    }

    let appUser = await this.users.findByClerkUserId(clerkUserId);
    if (!appUser) {
      // Repli : le webhook Clerk n'a pas encore synchronisé app_users (ex.
      // toute première requête après l'inscription). On interroge l'API
      // Clerk une fois pour récupérer l'email, puis on upsert.
      const clerk = createClerkClient({ secretKey });
      const clerkUser = await clerk.users.getUser(clerkUserId);
      const email =
        clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress;
      if (!email) {
        throw new UnauthorizedException('Compte Clerk sans email vérifiable');
      }
      const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() || null;
      appUser = await this.users.upsertFromClerk({ clerkUserId, email, fullName });
    }

    const authenticated: AuthenticatedAppUser = {
      id: appUser.id,
      clerkUserId,
      email: appUser.emailEncrypted ? decryptField(appUser.emailEncrypted as unknown as Buffer) : null,
    };
    request.appUser = authenticated;
    return true;
  }
}
