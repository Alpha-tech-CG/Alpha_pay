import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { formatAmount, toMajorAmount } from '../../common/money';

/** Fenêtre temporelle pour les indicateurs. */
function windowStart(period: 'day' | 'week' | 'month'): Date {
  const now = new Date();
  if (period === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

@Injectable()
export class MerchantStatsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async getStats(merchantId: string, livemode: boolean) {
    const [day, week, month, byOperator, failureRate] = await Promise.all([
      this.periodStats(merchantId, livemode, 'day'),
      this.periodStats(merchantId, livemode, 'week'),
      this.periodStats(merchantId, livemode, 'month'),
      this.byOperator(merchantId, livemode),
      this.failureRate(merchantId, livemode),
    ]);
    return { day, week, month, by_operator: byOperator, failure_rate: failureRate };
  }

  private async periodStats(merchantId: string, livemode: boolean, period: 'day' | 'week' | 'month') {
    const since = windowStart(period);
    const rows = await this.prisma.transaction.groupBy({
      by: ['status'],
      where: { merchantId, livemode, createdAt: { gte: since } },
      _count: { id: true },
      _sum: { amount: true },
    });

    const succeeded = rows.find((r) => r.status === 'SUCCEEDED');
    const failed = rows.find((r) => r.status === 'FAILED');
    const total = rows.reduce((a, r) => a + r._count.id, 0);

    return {
      succeeded_count: succeeded?._count.id ?? 0,
      succeeded_volume: succeeded?._sum.amount != null ? toMajorAmount(succeeded._sum.amount, 'XAF') : 0,
      succeeded_volume_display: succeeded?._sum.amount != null ? formatAmount(succeeded._sum.amount, 'XAF') : '0 XAF',
      failed_count: failed?._count.id ?? 0,
      total_count: total,
    };
  }

  private async byOperator(merchantId: string, livemode: boolean) {
    const since = windowStart('month');
    const rows = await this.prisma.transaction.groupBy({
      by: ['operator'],
      where: { merchantId, livemode, status: 'SUCCEEDED', createdAt: { gte: since } },
      _count: { id: true },
      _sum: { amount: true },
    });
    return rows.map((r) => ({
      operator: r.operator.toLowerCase(),
      count: r._count.id,
      volume: r._sum.amount != null ? toMajorAmount(r._sum.amount, 'XAF') : 0,
      volume_display: r._sum.amount != null ? formatAmount(r._sum.amount, 'XAF') : '0 XAF',
    }));
  }

  private async failureRate(merchantId: string, livemode: boolean) {
    const since = windowStart('month');
    const rows = await this.prisma.transaction.groupBy({
      by: ['status'],
      where: { merchantId, livemode, createdAt: { gte: since } },
      _count: { id: true },
    });
    const succeeded = rows.find((r) => r.status === 'SUCCEEDED')?._count.id ?? 0;
    const failed = rows.find((r) => r.status === 'FAILED')?._count.id ?? 0;
    const total = succeeded + failed;
    return total === 0 ? 0 : Math.round((failed / total) * 10000) / 100;
  }
}
