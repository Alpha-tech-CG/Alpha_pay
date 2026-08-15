import { Inject, Injectable } from '@nestjs/common';
import { MerchantMemberEventType, Prisma, PrismaClient } from '@paybrain/database';

export interface RecordEventInput {
  merchantId: string;
  memberId?: string | null;
  actorUserId?: string | null;
  eventType: MerchantMemberEventType;
  metadata?: Record<string, unknown>;
}

/**
 * Journal d'audit append-only des mutations d'équipe. `record()` prend
 * explicitement un `Prisma.TransactionClient` : chaque mutation sensible doit
 * écrire son événement DANS la même transaction que la mutation elle-même
 * (§6 du handoff), jamais après coup.
 */
@Injectable()
export class MemberEventsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  record(tx: Prisma.TransactionClient, input: RecordEventInput) {
    return tx.merchantMemberEvent.create({
      data: {
        merchantId: input.merchantId,
        memberId: input.memberId ?? null,
        actorUserId: input.actorUserId ?? null,
        eventType: input.eventType,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  list(merchantId: string) {
    return this.prisma.merchantMemberEvent.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
