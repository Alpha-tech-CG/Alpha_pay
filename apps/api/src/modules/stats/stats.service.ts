import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { toMajor } from '../../common/money';

@Injectable()
export class StatsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async getStats() {
    const [totals, recent] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { amount: true },
      }),
      this.prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { merchant: { select: { name: true } } },
      }),
    ]);

    return {
      totals: totals.map((t) => ({
        status: t.status,
        count: t._count.id,
        volume: t._sum.amount != null ? toMajor(t._sum.amount) : 0,
      })),
      // N'expose JAMAIS payerPhoneEnc/Hash : seulement le masque (ALP-164).
      recent: recent.map((t) => {
        const { payerPhoneEnc, payerPhoneHash, payerPhoneMask, merchant, ...rest } = t;
        return { ...rest, amount: toMajor(t.amount), merchantName: merchant.name, payerPhone: payerPhoneMask ?? '***' };
      }),
    };
  }
}
