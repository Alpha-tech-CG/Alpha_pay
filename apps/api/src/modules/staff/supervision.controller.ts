import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { Inject } from '@nestjs/common';
import { StaffGuard } from './staff.guard';

@Controller('internal/supervision')
@UseGuards(StaffGuard)
export class SupervisionController {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  // ─── Paiements en échec par opérateur (T-93) ──────────────────────────────

  @Get('payments/failures')
  async paymentFailures(@Query('hours') hours = '24') {
    const since = new Date(Date.now() - Math.min(Math.max(parseInt(hours) || 24, 1), 24 * 31) * 3_600_000);
    const rows = await this.prisma.transaction.groupBy({
      by: ['operator'],
      where: { livemode: true, status: 'FAILED', createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const total = await this.prisma.transaction.count({ where: { livemode: true, createdAt: { gte: since } } });
    return {
      since: since.toISOString(),
      total_transactions: total,
      failures_by_operator: rows.map((r) => ({ operator: r.operator, count: r._count.id })),
    };
  }

  // ─── Messages par fournisseur (T-93) ──────────────────────────────────────

  @Get('messages/stats')
  async messageStats(@Query('hours') hours = '24') {
    const since = new Date(Date.now() - Math.min(Math.max(parseInt(hours) || 24, 1), 24 * 31) * 3_600_000);
    const rows = await this.prisma.message.groupBy({
      by: ['provider', 'status'],
      where: { livemode: true, createdAt: { gte: since } },
      _count: { id: true },
    });
    return { since: since.toISOString(), stats: rows };
  }

  // ─── Webhooks en échec (T-93) ─────────────────────────────────────────────

  @Get('webhooks/failures')
  async webhookFailures(@Query('limit') limit = '50') {
    return this.prisma.webhookDelivery.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(parseInt(limit) || 50, 1), 200),
      include: {
        endpoint: { select: { url: true, merchantId: true } },
      },
    });
  }

  // ─── Tableau de bord global ────────────────────────────────────────────────

  @Get('dashboard')
  async dashboard() {
    const since24h = new Date(Date.now() - 86_400_000);
    const [merchants, txDay, txFailed, kybPending] = await Promise.all([
      this.prisma.merchant.count({ where: { isActive: true } }),
      this.prisma.transaction.count({ where: { livemode: true, createdAt: { gte: since24h } } }),
      this.prisma.transaction.count({ where: { livemode: true, status: 'FAILED', createdAt: { gte: since24h } } }),
      this.prisma.kybApplication.count({ where: { status: { in: ['SUBMITTED', 'IN_REVIEW'] } } }),
    ]);
    return {
      active_merchants: merchants,
      tx_24h: txDay,
      tx_failed_24h: txFailed,
      failure_rate_pct: txDay > 0 ? Math.round((txFailed / txDay) * 10000) / 100 : 0,
      kyb_pending: kybPending,
    };
  }
}
