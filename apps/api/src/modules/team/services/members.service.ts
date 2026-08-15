import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@paybrain/database';
import { decryptField, maskEmail } from '../../../common/security/pii-crypto';
import { can, canActOn, canAssignRole, MemberRole } from '../permissions/permissions';
import { MemberEventsService } from './member-events.service';

export interface TeamActor {
  userId: string;
  role: MemberRole;
}

export interface MemberSummary {
  id: string;
  userId: string;
  role: MemberRole;
  status: string;
  email: string | null;
  fullName: string | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  suspendedAt: Date | null;
}

export interface MyMerchantSummary {
  merchantId: string;
  merchantName: string;
  role: MemberRole;
}

@Injectable()
export class MembersService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly events: MemberEventsService,
  ) {}

  /**
   * `viewerRole` détermine si l'email est renvoyé en clair ou masqué
   * (durcissement étape F) : seuls les rôles habilités à gérer l'équipe
   * (`team:invite` → MANAGER+) voient l'email complet des membres, les
   * autres (MEMBER/VIEWER) ne voient qu'un email masqué (`je***@ex.com`).
   */
  async list(merchantId: string, viewerRole: MemberRole): Promise<MemberSummary[]> {
    const members = await this.prisma.merchantMember.findMany({
      where: { merchantId, status: { not: 'REMOVED' } },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    const revealEmail = can(viewerRole, 'team:invite');
    return members.map((m) => {
      const email = m.user.emailEncrypted ? decryptField(m.user.emailEncrypted as unknown as Buffer) : null;
      return {
        id: m.id,
        userId: m.userId,
        role: m.role as MemberRole,
        status: m.status,
        email: email && !revealEmail ? maskEmail(email) : email,
        fullName: m.user.fullName,
        invitedAt: m.invitedAt,
        joinedAt: m.joinedAt,
        suspendedAt: m.suspendedAt,
      };
    });
  }

  /**
   * Marchands sur lesquels cet utilisateur a un membership ACTIVE — sert au
   * frontend à résoudre le `:merchantId` à utiliser (aucune notion de
   * marchand « courant » côté client avant cet appel, cf. étape E).
   */
  async listForUser(userId: string): Promise<MyMerchantSummary[]> {
    const memberships = await this.prisma.merchantMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { merchant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      merchantId: m.merchant.id,
      merchantName: m.merchant.name,
      role: m.role as MemberRole,
    }));
  }

  async changeRole(merchantId: string, memberId: string, newRole: MemberRole, actor: TeamActor) {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.loadActiveOrSuspended(tx, merchantId, memberId);
      this.assertCanAct(actor, target.role as MemberRole);
      if (!canAssignRole(actor.role, newRole)) {
        throw new ForbiddenException('Rôle cible non attribuable (jamais ≥ au sien, jamais OWNER)');
      }
      await this.guardLastOwner(tx, merchantId, target.role as MemberRole);

      const updated = await tx.merchantMember.update({ where: { id: target.id }, data: { role: newRole } });
      await this.events.record(tx, {
        merchantId,
        memberId: target.id,
        actorUserId: actor.userId,
        eventType: 'ROLE_CHANGED',
        metadata: { from: target.role, to: newRole },
      });
      return updated;
    });
  }

  async suspend(merchantId: string, memberId: string, actor: TeamActor) {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.loadMemberByStatus(tx, merchantId, memberId, 'ACTIVE');
      this.assertCanAct(actor, target.role as MemberRole);
      await this.guardLastOwner(tx, merchantId, target.role as MemberRole);

      const updated = await tx.merchantMember.update({
        where: { id: target.id },
        data: { status: 'SUSPENDED', suspendedAt: new Date() },
      });
      await this.events.record(tx, {
        merchantId,
        memberId: target.id,
        actorUserId: actor.userId,
        eventType: 'MEMBER_SUSPENDED',
      });
      return updated;
    });
  }

  async reactivate(merchantId: string, memberId: string, actor: TeamActor) {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.loadMemberByStatus(tx, merchantId, memberId, 'SUSPENDED');
      this.assertCanAct(actor, target.role as MemberRole);

      const updated = await tx.merchantMember.update({
        where: { id: target.id },
        data: { status: 'ACTIVE', suspendedAt: null },
      });
      await this.events.record(tx, {
        merchantId,
        memberId: target.id,
        actorUserId: actor.userId,
        eventType: 'MEMBER_REACTIVATED',
      });
      return updated;
    });
  }

  async remove(merchantId: string, memberId: string, actor: TeamActor) {
    return this.prisma.$transaction(async (tx) => {
      const target = await this.loadActiveOrSuspended(tx, merchantId, memberId);
      this.assertCanAct(actor, target.role as MemberRole);
      await this.guardLastOwner(tx, merchantId, target.role as MemberRole);

      const updated = await tx.merchantMember.update({
        where: { id: target.id },
        data: { status: 'REMOVED', removedAt: new Date() },
      });
      await this.events.record(tx, {
        merchantId,
        memberId: target.id,
        actorUserId: actor.userId,
        eventType: 'MEMBER_REMOVED',
      });
      return updated;
    });
  }

  private async loadMemberByStatus(
    tx: Prisma.TransactionClient,
    merchantId: string,
    memberId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ) {
    const member = await tx.merchantMember.findFirst({ where: { id: memberId, merchantId, status } });
    if (!member) throw new NotFoundException('Membre introuvable');
    return member;
  }

  private async loadActiveOrSuspended(tx: Prisma.TransactionClient, merchantId: string, memberId: string) {
    const member = await tx.merchantMember.findFirst({
      where: { id: memberId, merchantId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
    });
    if (!member) throw new NotFoundException('Membre introuvable');
    return member;
  }

  /** Anti-escalade : seul un rôle strictement supérieur agit sur la cible. */
  private assertCanAct(actor: TeamActor, targetRole: MemberRole) {
    if (!canActOn(actor.role, targetRole)) {
      throw new ForbiddenException('Rôle insuffisant pour agir sur ce membre');
    }
  }

  /**
   * Défense en profondeur (charte sécurité) : si la cible est l'OWNER actif,
   * refuse — même si `canActOn` bloque déjà structurellement toute action sur
   * un OWNER (rang maximal, aucun acteur n'a un rang strictement supérieur).
   * Cette garde protège contre une évolution future de la matrice RBAC.
   * Le seul chemin pour changer d'OWNER reste `ownership.service.transfer`.
   */
  private async guardLastOwner(tx: Prisma.TransactionClient, merchantId: string, targetRole: MemberRole) {
    if (targetRole !== 'OWNER') return;
    const owners = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM merchant_members
      WHERE merchant_id = ${merchantId} AND role = 'OWNER' AND status = 'ACTIVE'
      FOR UPDATE
    `;
    if (owners.length <= 1) {
      throw new ForbiddenException(
        'Impossible : il doit rester au moins un OWNER actif. Transférez la propriété avant de continuer.',
      );
    }
  }
}
