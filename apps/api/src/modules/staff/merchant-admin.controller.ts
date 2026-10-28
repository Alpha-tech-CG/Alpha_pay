import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { Inject } from '@nestjs/common';
import { AuditAction } from '../../common/audit/audit.interceptor';
import { StaffGuard } from './staff.guard';
import { StaffAuthService } from './staff-auth.service';

@Controller('internal/merchants')
@UseGuards(StaffGuard)
export class MerchantAdminController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly auth: StaffAuthService,
  ) {}

  // ─── File KYB (T-91) ───────────────────────────────────────────────────────

  @Get('kyb-queue')
  async kybQueue(@Query('status') status?: string) {
    return this.prisma.kybApplication.findMany({
      where: status ? { status: status.toUpperCase() as any } : { status: { in: ['SUBMITTED', 'IN_REVIEW'] as any[] } },
      orderBy: { submittedAt: 'asc' },
      take: 50,
      include: {
        merchant: { select: { id: true, name: true, companyName: true } },
        kycChecks: { select: { status: true, completedAt: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  // ─── Fiches marchands (T-91) ───────────────────────────────────────────────

  @Get()
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    const where: any = {};
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { companyName: { contains: q, mode: 'insensitive' } }];
    if (status) where.onboardingStatus = status.toUpperCase();
    return this.prisma.merchant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 25,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, name: true, companyName: true, onboardingStatus: true, merchantType: true,
        isActive: true, createdAt: true,
      },
    });
  }

  @Get(':merchantId')
  async sheet(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    const [merchant, sub, balance, txStats] = await Promise.all([
      this.prisma.merchant.findUnique({
        where: { id: merchantId },
        include: {
          kybApplication: { select: { status: true, submittedAt: true, decidedAt: true } },
          members: { select: { id: true, role: true, userId: true, createdAt: true } },
        },
      }),
      this.prisma.subscription.findUnique({ where: { merchantId }, include: { plan: true } }),
      this.prisma.creditLedger.aggregate({ where: { merchantId } as any, _sum: { delta: true } }),
      this.prisma.transaction.aggregate({
        where: { merchantId, livemode: true },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    if (!merchant) return null;

    return {
      ...merchant,
      subscription: sub ? { plan: sub.plan.code, status: sub.status, periodEnd: sub.periodEnd } : null,
      credit_balance: balance._sum.delta ?? 0,
      tx_live: { count: txStats._count.id, volume: Number(txStats._sum.amount ?? 0n) },
    };
  }

  // ─── Suspension / réactivation motivée (T-91) ─────────────────────────────

  @Post(':merchantId/suspend')
  @AuditAction('merchant.suspend', 'merchant')
  async suspend(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { isActive: false, rejectionReason: body.reason },
    });
    await this.logAction(req.staffUser.staffId, 'merchant.suspend', merchantId, { reason: body.reason }, req.ip);
    return { suspended: true };
  }

  @Post(':merchantId/reactivate')
  @AuditAction('merchant.reactivate', 'merchant')
  async reactivate(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { isActive: true, rejectionReason: null },
    });
    await this.logAction(req.staffUser.staffId, 'merchant.reactivate', merchantId, body, req.ip);
    return { active: true };
  }

  // ─── Gestion paliers / crédits (T-92) ─────────────────────────────────────

  @Patch(':merchantId/subscription')
  async changePlan(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() body: { plan_code: string },
    @Req() req: any,
  ) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code: body.plan_code } });
    if (!plan) return { error: 'Plan introuvable' };
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);
    const sub = await this.prisma.subscription.upsert({
      where: { merchantId },
      create: { merchantId, planId: plan.id, status: 'ACTIVE', periodStart: new Date(), periodEnd },
      update: { planId: plan.id, status: 'ACTIVE', periodEnd },
    });
    await this.logAction(req.staffUser.staffId, 'merchant.plan_change', merchantId, { plan_code: body.plan_code }, req.ip);
    return sub;
  }

  @Post(':merchantId/credits/adjust')
  async adjustCredits(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() body: { delta: number; reason: string },
    @Req() req: any,
  ) {
    await this.prisma.creditLedger.create({
      data: { merchantId, delta: body.delta, reason: body.reason } as any,
    });
    await this.logAction(req.staffUser.staffId, 'merchant.credits_adjust', merchantId, body, req.ip);
    const agg = await this.prisma.creditLedger.aggregate({ where: { merchantId } as any, _sum: { delta: true } });
    return { new_balance: agg._sum.delta ?? 0 };
  }

  // ─── Helper log ─────────────────────────────────────────────────────────────

  private async logAction(staffId: string, action: string, targetId: string, detail: any, ip?: string) {
    await this.prisma.staffAccessLog.create({ data: { staffId, action, targetId, detail, ip } });
  }
}
