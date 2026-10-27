import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { toMajorAmount } from '../../common/money';

@Injectable()
export class StatsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async getStats(merchantId: string) {
    const [totals, byOperator, recent] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['status'],
        where: { merchantId },
        _count: { id: true },
        _sum: { amount: true },
      }),
      // Volume encaissé (SUCCESSFUL) ventilé par opérateur — alimente la hero card.
      this.prisma.transaction.groupBy({
        by: ['operator'],
        where: { merchantId, status: 'SUCCESSFUL' },
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.transaction.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { merchant: { select: { name: true } } },
      }),
    ]);

    return {
      totals: totals.map((t) => ({
        status: t.status,
        count: t._count.id,
        volume: t._sum.amount != null ? toMajorAmount(t._sum.amount, 'XAF') : 0,
      })),
      byOperator: byOperator.map((o) => ({
        operator: o.operator,
        count: o._count.id,
        volume: o._sum.amount != null ? toMajorAmount(o._sum.amount, 'XAF') : 0,
      })),
      // N'expose JAMAIS payerPhoneEnc/Hash : seulement le masque (ALP-164).
      recent: recent.map((t) => {
        const { payerPhoneEnc, payerPhoneHash, payerPhoneMask, merchant, ...rest } = t;
        return { ...rest, amount: toMajorAmount(t.amount, t.currency), merchantName: merchant.name, payerPhone: payerPhoneMask ?? '***' };
      }),
    };
  }
}
