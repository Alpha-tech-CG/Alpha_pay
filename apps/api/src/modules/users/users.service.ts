import { Inject, Injectable } from '@nestjs/common';
import { AppUser, PrismaClient } from '@paybrain/database';
import { deterministicHash, encryptField, normalizeEmail } from '@paybrain/shared';

export interface UpsertFromClerkInput {
  clerkUserId: string;
  email: string;
  fullName?: string | null;
}

type B = Uint8Array<ArrayBuffer>;

@Injectable()
export class UsersService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  findByClerkUserId(clerkUserId: string): Promise<AppUser | null> {
    return this.prisma.appUser.findUnique({ where: { clerkUserId } });
  }

  /**
   * Source de vérité = webhook Clerk (user.created/updated). Réutilisé en
   * repli par ClerkSessionGuard quand un token valide arrive avant que le
   * webhook n'ait synchronisé app_users (ex. juste après l'inscription).
   */
  async upsertFromClerk(input: UpsertFromClerkInput): Promise<AppUser> {
    const email = normalizeEmail(input.email);
    const emailHash = deterministicHash(email) as unknown as B;
    const emailEncrypted = encryptField(email) as unknown as B;
    const fullName = input.fullName?.trim() || null;

    const existing = await this.prisma.appUser.findUnique({
      where: { clerkUserId: input.clerkUserId },
    });
    if (existing) {
      return this.prisma.appUser.update({
        where: { id: existing.id },
        data: { emailEncrypted, emailHash, fullName: fullName ?? existing.fullName },
      });
    }

    // Repli idempotent : un app_user peut déjà exister pour cet email (ex. race
    // entre le webhook et la première requête authentifiée) sans clerk_user_id.
    return this.prisma.appUser.upsert({
      where: { emailHash },
      update: { clerkUserId: input.clerkUserId, emailEncrypted, fullName: fullName ?? undefined },
      create: {
        clerkUserId: input.clerkUserId,
        emailEncrypted,
        emailHash,
        fullName,
      },
    });
  }

  async markDeletedByClerkUserId(clerkUserId: string): Promise<void> {
    // On ne supprime jamais app_users physiquement : les FK (memberships,
    // événements d'audit) doivent survivre. On coupe juste le lien Clerk pour
    // qu'aucune session future ne s'authentifie plus sur ce compte.
    await this.prisma.appUser.updateMany({
      where: { clerkUserId },
      data: { clerkUserId: null },
    });
  }
}
