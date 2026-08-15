import { createHash, randomBytes } from 'crypto';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@paybrain/database';
import { decryptField, deterministicHash, encryptField, maskEmail, normalizeEmail } from '../../../common/security/pii-crypto';
import { NotificationService } from '../../notifications/notification.service';
import { can, MemberAction, MemberRole } from '../permissions/permissions';
import { MemberEventsService } from './member-events.service';
import { TeamActor } from './members.service';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateInvitationInput {
  email: string;
  role: MemberRole;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface InvitationSummary {
  id: string;
  email: string | null;
  role: MemberRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type B = Uint8Array<ArrayBuffer>;

@Injectable()
export class InvitationsService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly events: MemberEventsService,
    private readonly notifications: NotificationService,
  ) {}

  async create(merchantId: string, input: CreateInvitationInput, actor: TeamActor) {
    if (input.role === 'OWNER') {
      throw new ForbiddenException("OWNER ne s'invite pas — passez par un transfert de propriété");
    }
    const requiredAction: MemberAction = input.role === 'ADMIN' ? 'team:invite_admin' : 'team:invite';
    if (!can(actor.role, requiredAction)) {
      throw new ForbiddenException('Rôle insuffisant pour inviter ce rôle');
    }

    const email = normalizeEmail(input.email);
    const emailHash = deterministicHash(email);
    const emailEncrypted = encryptField(email);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    let created: { id: string; merchantName: string; role: MemberRole; expiresAt: Date };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.merchantInvitation.create({
          data: {
            merchantId,
            emailHash: emailHash as unknown as B,
            emailEncrypted: emailEncrypted as unknown as B,
            role: input.role,
            tokenHash,
            invitedById: actor.userId,
            expiresAt,
          },
          include: { merchant: { select: { name: true } } },
        });
        await this.events.record(tx, {
          merchantId,
          actorUserId: actor.userId,
          eventType: 'INVITATION_SENT',
          metadata: { invitationId: invitation.id, role: input.role },
        });
        return {
          id: invitation.id,
          merchantName: invitation.merchant.name,
          role: invitation.role as MemberRole,
          expiresAt: invitation.expiresAt,
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Une invitation est déjà en attente pour cet email sur ce marchand');
      }
      throw err;
    }

    // Le token en clair ne transite QUE dans cet email — jamais persisté, jamais renvoyé en API.
    const inviteBaseUrl = process.env.APP_INVITE_BASE_URL ?? 'https://dashboard.paybrain.cg/invite';
    await this.notifications.send({
      channel: 'EMAIL',
      to: email,
      template: 'team.invitation',
      data: { merchantName: created.merchantName, role: created.role, link: `${inviteBaseUrl}?token=${token}` },
      category: 'team',
      merchantId,
    });

    return { id: created.id, email, role: created.role, expiresAt: created.expiresAt };
  }

  async list(merchantId: string): Promise<InvitationSummary[]> {
    const invitations = await this.prisma.merchantInvitation.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.emailEncrypted ? maskEmail(decryptField(inv.emailEncrypted as unknown as Buffer)) : null,
      role: inv.role as MemberRole,
      status: this.statusOf(inv),
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  async revoke(merchantId: string, invitationId: string, actor: TeamActor) {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.merchantInvitation.findFirst({ where: { id: invitationId, merchantId } });
      if (!invitation) throw new NotFoundException('Invitation introuvable');
      if (invitation.acceptedAt) throw new ConflictException('Invitation déjà acceptée');
      if (invitation.revokedAt) return invitation; // idempotent

      const updated = await tx.merchantInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });
      await this.events.record(tx, {
        merchantId,
        actorUserId: actor.userId,
        eventType: 'INVITATION_REVOKED',
        metadata: { invitationId: invitation.id },
      });
      return updated;
    });
  }

  /** Aperçu public (page /invite?token=...) : aucune donnée sensible exposée. */
  async preview(token: string) {
    const invitation = await this.prisma.merchantInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { merchant: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation introuvable');

    return {
      merchantName: invitation.merchant.name,
      role: invitation.role as MemberRole,
      email: maskEmail(decryptField(invitation.emailEncrypted as unknown as Buffer)),
      expired: invitation.expiresAt < new Date(),
      revoked: invitation.revokedAt != null,
      accepted: invitation.acceptedAt != null,
    };
  }

  async accept(token: string, appUser: { id: string; email: string | null }) {
    const tokenHash = hashToken(token);

    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM merchant_invitations WHERE token_hash = ${tokenHash} FOR UPDATE
      `;
      if (lock.length === 0) throw new NotFoundException('Invitation introuvable');
      const invitation = await tx.merchantInvitation.findUniqueOrThrow({ where: { id: lock[0].id } });

      if (invitation.revokedAt) throw new ForbiddenException('Invitation révoquée');
      if (invitation.acceptedAt) throw new ConflictException('Invitation déjà acceptée');
      if (invitation.expiresAt < new Date()) throw new ForbiddenException('Invitation expirée');

      if (!appUser.email) throw new ForbiddenException('Compte sans email vérifiable');
      const presentedHash = deterministicHash(normalizeEmail(appUser.email));
      if (!presentedHash.equals(invitation.emailHash as unknown as Buffer)) {
        throw new ForbiddenException('Cette invitation est destinée à une autre adresse email');
      }

      const member = await tx.merchantMember.upsert({
        where: { merchantId_userId: { merchantId: invitation.merchantId, userId: appUser.id } },
        create: {
          merchantId: invitation.merchantId,
          userId: appUser.id,
          role: invitation.role,
          status: 'ACTIVE',
          invitedAt: invitation.createdAt,
          joinedAt: new Date(),
        },
        update: { role: invitation.role, status: 'ACTIVE', joinedAt: new Date(), removedAt: null, suspendedAt: null },
      });

      await tx.merchantInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      await this.events.record(tx, {
        merchantId: invitation.merchantId,
        memberId: member.id,
        actorUserId: appUser.id,
        eventType: 'INVITATION_ACCEPTED',
        metadata: { invitationId: invitation.id },
      });
      return member;
    });
  }

  private statusOf(inv: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InvitationStatus {
    if (inv.acceptedAt) return 'ACCEPTED';
    if (inv.revokedAt) return 'REVOKED';
    if (inv.expiresAt < new Date()) return 'EXPIRED';
    return 'PENDING';
  }
}
