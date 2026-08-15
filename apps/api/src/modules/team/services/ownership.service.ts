import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { MemberEventsService } from './member-events.service';
import { TeamActor } from './members.service';

export interface OwnershipTransferResult {
  fromMemberId: string;
  toMemberId: string;
  toUserId: string;
}

@Injectable()
export class OwnershipService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly events: MemberEventsService,
  ) {}

  async transfer(merchantId: string, toUserId: string, actor: TeamActor): Promise<OwnershipTransferResult> {
    if (actor.role !== 'OWNER') {
      throw new ForbiddenException('Seul le OWNER actif peut transférer la propriété');
    }

    return this.prisma.$transaction(async (tx) => {
      // Défense en profondeur : re-vérifie contre la DB dans la transaction,
      // ne fait jamais confiance uniquement au rôle porté par la session.
      const currentOwner = await tx.merchantMember.findFirst({
        where: { merchantId, role: 'OWNER', status: 'ACTIVE' },
      });
      if (!currentOwner || currentOwner.userId !== actor.userId) {
        throw new ForbiddenException('Seul le OWNER actif peut transférer la propriété');
      }
      if (toUserId === actor.userId) {
        throw new ConflictException('Vous êtes déjà OWNER');
      }

      const target = await tx.merchantMember.findFirst({
        where: { merchantId, userId: toUserId, status: 'ACTIVE' },
      });
      if (!target) throw new NotFoundException('Le destinataire doit être membre actif de ce marchand');
      if (target.role === 'OWNER') throw new ConflictException('Le destinataire est déjà OWNER');

      // Ordre important : démettre l'ancien OWNER AVANT de promouvoir le
      // nouveau, pour ne jamais violer l'index unique partiel « 1 seul OWNER
      // actif » avec un état transitoire à deux OWNER simultanés.
      await tx.merchantMember.update({ where: { id: currentOwner.id }, data: { role: 'ADMIN' } });
      await tx.merchantMember.update({ where: { id: target.id }, data: { role: 'OWNER' } });
      await tx.merchant.update({ where: { id: merchantId }, data: { ownerUserId: toUserId } });

      await this.events.record(tx, {
        merchantId,
        memberId: target.id,
        actorUserId: actor.userId,
        eventType: 'OWNERSHIP_TRANSFERRED',
        metadata: { fromUserId: actor.userId, fromMemberId: currentOwner.id, toUserId },
      });

      return { fromMemberId: currentOwner.id, toMemberId: target.id, toUserId };
    });
  }
}
