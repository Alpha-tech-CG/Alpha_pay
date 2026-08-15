import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { AuthenticatedAppUser } from './clerk-session.guard';
import { MemberRole } from '../permissions/permissions';

export interface AuthenticatedMembership {
  merchantId: string;
  role: MemberRole;
}

/**
 * Doit s'exécuter APRÈS ClerkSessionGuard. Charge le membership ACTIVE de
 * req.appUser sur le `:merchantId` du path et pose `req.membership`.
 *
 * ⚠️ Le merchantId n'est JAMAIS lu depuis le body/query — uniquement le path.
 * Toute requête doit être filtrée par `req.membership.merchantId`, jamais par
 * un merchantId fourni ailleurs par le client.
 */
@Injectable()
export class RequireMemberGuard implements CanActivate {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const appUser: AuthenticatedAppUser | undefined = request.appUser;
    const merchantId: string | undefined = request.params?.merchantId;

    if (!appUser) {
      throw new ForbiddenException('Authentification requise');
    }
    if (!merchantId) {
      throw new ForbiddenException('merchantId manquant dans la route');
    }

    const member = await this.prisma.merchantMember.findFirst({
      where: { merchantId, userId: appUser.id, status: 'ACTIVE' },
      select: { role: true },
    });

    // Même erreur que le marchand n'existe pas ou n'a pas de membership actif :
    // on ne révèle jamais l'existence d'un marchand à un non-membre.
    if (!member) {
      throw new ForbiddenException('Aucun accès à ce marchand');
    }

    const membership: AuthenticatedMembership = { merchantId, role: member.role as MemberRole };
    request.membership = membership;
    return true;
  }
}
