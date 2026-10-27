import { createHash, randomBytes } from 'crypto';
import { ConflictException, ForbiddenException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@paybrain/database';
import { toE164 } from '@paybrain/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { ApiError } from '../../../common/errors/api-error';
import { decryptField, deterministicHash, encryptField, maskEmail, maskPhone, normalizeEmail } from '../../../common/security/pii-crypto';
import { MessagingService } from '../../messaging/messaging.service';
import { can, canAssignRole, MemberRole } from '../permissions/permissions';
import { MemberEventsService } from './member-events.service';
import { TeamActor } from './members.service';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  ACCOUNTANT: 'Comptable',
  CASHIER: 'Caissier',
  DEVELOPER: 'Développeur',
};

export interface CreateInvitationInput {
  email?: string;
  phone?: string;
  role: MemberRole;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface InvitationSummary {
  id: string;
  email: string | null;
  phone: string | null;
  role: MemberRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const b = (buf: Buffer) => new Uint8Array(buf);

/** Invitations d'équipe (§M1) : par téléphone ou par email, valables 7 jours. */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly events: MemberEventsService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
  ) {}

  async create(merchantId: string, input: CreateInvitationInput, actor: TeamActor) {
    if (!can(actor.role, 'team:invite') || !canAssignRole(actor.role, input.role)) {
      throw new ForbiddenException('Rôle insuffisant pour inviter ce rôle (le propriétaire se transfère, il ne s’invite pas)');
    }
    if (!input.email === !input.phone) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', 'Indiquez un email OU un numéro de téléphone', 'email');
    }

    let email: string | undefined;
    let phone: string | undefined;
    if (input.email) email = normalizeEmail(input.email);
    if (input.phone) {
      try {
        phone = toE164(input.phone);
      } catch (err: any) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'telephone_invalide', err.message, 'phone');
      }
    }

    const token = randomBytes(32).toString('base64url');
    let created: { id: string; merchantName: string; role: MemberRole; expiresAt: Date };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.merchantInvitation.create({
          data: {
            merchantId,
            ...(email ? { emailHash: b(deterministicHash(email)), emailEncrypted: b(encryptField(email)) } : {}),
            ...(phone ? { phoneHash: b(deterministicHash(phone)), phoneEncrypted: b(encryptField(phone)) } : {}),
            role: input.role,
            tokenHash: hashToken(token),
            invitedById: actor.userId,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          },
          include: { merchant: { select: { name: true } } },
        });
        await this.events.record(tx, {
          merchantId,
          actorUserId: actor.userId,
          eventType: 'INVITATION_SENT',
          metadata: { invitationId: invitation.id, role: input.role, channel: email ? 'email' : 'phone' },
        });
        return { id: invitation.id, merchantName: invitation.merchant.name, role: invitation.role as MemberRole, expiresAt: invitation.expiresAt };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Une invitation est déjà en attente pour ce contact sur ce marchand');
      }
      throw err;
    }

    // Le jeton en clair ne transite QUE dans le message — jamais persisté, jamais renvoyé par l'API.
    const base = process.env.APP_INVITE_BASE_URL ?? 'http://localhost:5174/invite';
    await this.messaging.send({
      merchantId: null,
      livemode: false,
      channels: email ? ['EMAIL'] : ['WHATSAPP', 'SMS'],
      to: email ? { email } : { phone },
      templateKey: 'equipe.invitation',
      variables: { merchantName: created.merchantName, role: ROLE_LABELS[created.role], link: `${base}?token=${token}` },
      category: 'TRANSACTIONAL',
    });
    await this.audit.record({
      actorType: 'user',
      actorId: actor.userId,
      merchantId,
      action: 'team.invitation_sent',
      targetType: 'invitation',
      targetId: created.id,
      metadata: { role: created.role },
    });

    return {
      id: created.id,
      email: email ? maskEmail(email) : null,
      phone: phone ? maskPhone(phone) : null,
      role: created.role,
      expiresAt: created.expiresAt,
    };
  }

  async list(merchantId: string): Promise<InvitationSummary[]> {
    const invitations = await this.prisma.merchantInvitation.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' } });
    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.emailEncrypted ? maskEmail(decryptField(inv.emailEncrypted)) : null,
      phone: inv.phoneEncrypted ? maskPhone(decryptField(inv.phoneEncrypted)) : null,
      role: inv.role as MemberRole,
      status: this.statusOf(inv),
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  async revoke(merchantId: string, invitationId: string, actor: TeamActor) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.merchantInvitation.findFirst({ where: { id: invitationId, merchantId } });
      if (!invitation) throw new NotFoundException('Invitation introuvable');
      if (invitation.acceptedAt) throw new ConflictException('Invitation déjà acceptée');
      if (invitation.revokedAt) return invitation; // idempotent

      const updated = await tx.merchantInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
      await this.events.record(tx, {
        merchantId,
        actorUserId: actor.userId,
        eventType: 'INVITATION_REVOKED',
        metadata: { invitationId: invitation.id },
      });
      return updated;
    });
    await this.audit.record({ actorType: 'user', actorId: actor.userId, merchantId, action: 'team.invitation_revoked', targetType: 'invitation', targetId: invitationId });
    return result;
  }

  /** Aperçu public (page /invite?token=…) : aucune donnée sensible exposée. */
  async preview(token: string) {
    const invitation = await this.prisma.merchantInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { merchant: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation introuvable');
    return {
      merchantName: invitation.merchant.name,
      role: invitation.role as MemberRole,
      email: invitation.emailEncrypted ? maskEmail(decryptField(invitation.emailEncrypted)) : null,
      phone: invitation.phoneEncrypted ? maskPhone(decryptField(invitation.phoneEncrypted)) : null,
      expired: invitation.expiresAt < new Date(),
      revoked: invitation.revokedAt != null,
      accepted: invitation.acceptedAt != null,
    };
  }

  /**
   * Acceptation par un utilisateur connecté dont l'email OU le téléphone
   * VÉRIFIÉ correspond au contact invité.
   */
  async accept(token: string, appUserId: string) {
    const tokenHash = hashToken(token);
    const member = await this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM merchant_invitations WHERE token_hash = ${tokenHash} FOR UPDATE
      `;
      if (lock.length === 0) throw new NotFoundException('Invitation introuvable');
      const invitation = await tx.merchantInvitation.findUniqueOrThrow({ where: { id: lock[0].id } });

      if (invitation.revokedAt) throw new ForbiddenException('Invitation révoquée');
      if (invitation.acceptedAt) throw new ConflictException('Invitation déjà acceptée');
      if (invitation.expiresAt < new Date()) throw new ForbiddenException('Invitation expirée');

      const user = await tx.appUser.findUniqueOrThrow({ where: { id: appUserId } });
      const emailMatch =
        invitation.emailHash && user.emailVerifiedAt && Buffer.from(user.emailHash).equals(Buffer.from(invitation.emailHash));
      const phoneMatch =
        invitation.phoneHash && user.phoneHash && user.phoneVerifiedAt && Buffer.from(user.phoneHash).equals(Buffer.from(invitation.phoneHash));
      if (!emailMatch && !phoneMatch) {
        throw new ForbiddenException('Cette invitation est destinée à un autre email ou numéro (vérifié)');
      }

      const m = await tx.merchantMember.upsert({
        where: { merchantId_userId: { merchantId: invitation.merchantId, userId: appUserId } },
        create: {
          merchantId: invitation.merchantId,
          userId: appUserId,
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
        memberId: m.id,
        actorUserId: appUserId,
        eventType: 'INVITATION_ACCEPTED',
        metadata: { invitationId: invitation.id },
      });
      return m;
    });
    await this.audit.record({
      actorType: 'user',
      actorId: appUserId,
      merchantId: member.merchantId,
      action: 'team.invitation_accepted',
      targetType: 'merchant_member',
      targetId: member.id,
    });
    return member;
  }

  private statusOf(inv: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InvitationStatus {
    if (inv.acceptedAt) return 'ACCEPTED';
    if (inv.revokedAt) return 'REVOKED';
    if (inv.expiresAt < new Date()) return 'EXPIRED';
    return 'PENDING';
  }
}
