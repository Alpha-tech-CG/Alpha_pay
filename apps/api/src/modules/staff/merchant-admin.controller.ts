import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Prisma, PrismaClient } from '@paybrain/database';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, NotEquals } from 'class-validator';
import { AuditService } from '../../common/audit/audit.service';
import { formatAmount, toMajorAmount } from '../../common/money';
import { MODULE_KEYS } from '../billing/billing.service';
import { RequireStaffRole, STAFF_WRITE, StaffGuard } from './staff.guard';

class ReasonDto {
  @IsString() @MinLength(3, { message: 'motif obligatoire' }) @MaxLength(500) reason!: string;
}

class ChangePlanDto extends ReasonDto {
  @IsString() @MaxLength(40) plan_code!: string;
}

class AdjustCreditsDto extends ReasonDto {
  @IsInt() @NotEquals(0) @Min(-1_000_000) @Max(1_000_000) delta!: number;
}

class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  /** Prix en unités majeures (XAF). */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) price_monthly?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) price_yearly?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsIn(Object.keys(MODULE_KEYS), { each: true }) included_modules?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) included_credits?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

class UpdatePackDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10_000_000) credits?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) price?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}

const money = (v: bigint | null | undefined) => ({ amount: v != null ? toMajorAmount(v, 'XAF') : 0, display: formatAmount(v ?? 0n, 'XAF') });

/**
 * Back-office : marchands, paliers, prix et crédits (§M12, T-91, T-92).
 * Lecture pour tous les agents ; suspension par la conformité ; paliers, prix
 * et crédits par le super-administrateur. Chaque écriture est motivée et auditée.
 */
@ApiExcludeController()
@Controller('internal')
@UseGuards(StaffGuard)
export class MerchantAdminController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  private record(req: any, action: string, merchantId: string | null, targetType: string, targetId: string, metadata: Record<string, unknown>) {
    return this.audit.record({ actorType: 'staff', actorId: req.staffUser.staffId, merchantId, action, targetType, targetId, ip: req.ip, metadata });
  }

  // ─── Marchands ─────────────────────────────────────────────────────────────

  @Get('merchants')
  list(@Query('q') q?: string, @Query('status') status?: string, @Query('cursor') cursor?: string) {
    const where: Prisma.MerchantWhereInput = {};
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { companyName: { contains: q, mode: 'insensitive' } }];
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) where.onboardingStatus = status.toUpperCase() as any;
    return this.prisma.merchant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 25,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, name: true, companyName: true, onboardingStatus: true, merchantType: true, isActive: true, rejectionReason: true, createdAt: true },
    });
  }

  @Get('merchants/:merchantId')
  async sheet(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        kybApplication: { select: { id: true, status: true, submittedAt: true, decidedAt: true } },
        members: { select: { id: true, role: true, status: true, createdAt: true } },
        providerConnections: { select: { operator: true, livemode: true, status: true } },
      },
    });
    if (!merchant) throw new NotFoundException('Marchand introuvable');
    const [sub, credits, live, test] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { merchantId }, include: { plan: true } }),
      this.prisma.creditLedger.aggregate({ where: { merchantId, livemode: true }, _sum: { delta: true } }),
      this.prisma.transaction.aggregate({ where: { merchantId, livemode: true, status: 'SUCCEEDED' }, _count: { id: true }, _sum: { amount: true } }),
      this.prisma.transaction.count({ where: { merchantId, livemode: false } }),
    ]);
    return {
      id: merchant.id,
      name: merchant.name,
      company_name: merchant.companyName,
      active: merchant.isActive,
      suspension_reason: merchant.isActive ? null : merchant.rejectionReason,
      onboarding_status: merchant.onboardingStatus,
      kyb: merchant.kybApplication,
      members: merchant.members,
      operators: merchant.providerConnections,
      subscription: sub ? { plan: sub.plan.code, label: sub.plan.label, status: sub.status, period_end: sub.periodEnd } : null,
      credit_balance: credits._sum.delta ?? 0,
      live_volume: { count: live._count.id, ...money(live._sum.amount) },
      test_payments: test,
      created_at: merchant.createdAt,
    };
  }

  /** Suspension (§M12) : motif obligatoire ; les clés et sessions du marchand cessent de fonctionner. */
  @Post('merchants/:merchantId/suspend')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.compliance)
  async suspend(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() body: ReasonDto, @Req() req: any) {
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { isActive: false, rejectionReason: body.reason } });
    await this.record(req, 'merchant.suspended', merchantId, 'merchant', merchantId, { reason: body.reason });
    return { active: false };
  }

  @Post('merchants/:merchantId/reactivate')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.compliance)
  async reactivate(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() body: ReasonDto, @Req() req: any) {
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { isActive: true, rejectionReason: null } });
    await this.record(req, 'merchant.reactivated', merchantId, 'merchant', merchantId, { reason: body.reason });
    return { active: true };
  }

  @Patch('merchants/:merchantId/subscription')
  @RequireStaffRole(...STAFF_WRITE.admin)
  async changePlan(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() body: ChangePlanDto, @Req() req: any) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code: body.plan_code } });
    if (!plan) throw new NotFoundException('Palier introuvable');
    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + 30 * 86_400_000);
    const sub = await this.prisma.subscription.upsert({
      where: { merchantId },
      create: { merchantId, planId: plan.id, status: 'ACTIVE', periodStart, periodEnd },
      update: { planId: plan.id, status: 'ACTIVE', periodEnd },
    });
    await this.record(req, 'merchant.plan_changed', merchantId, 'subscription', sub.id, { plan: plan.code, reason: body.reason });
    return { plan: plan.code, status: sub.status, period_end: sub.periodEnd };
  }

  /** Ajustement de crédits (geste commercial, correction) : écriture au registre en ajout seul, mode live. */
  @Post('merchants/:merchantId/credits/adjust')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.admin)
  async adjustCredits(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() body: AdjustCreditsDto, @Req() req: any) {
    const row = await this.prisma.creditLedger.create({ data: { merchantId, livemode: true, delta: body.delta, reason: 'ajustement' } });
    await this.record(req, 'merchant.credits_adjusted', merchantId, 'credit_ledger', row.id, { delta: body.delta, reason: body.reason });
    const agg = await this.prisma.creditLedger.aggregate({ where: { merchantId, livemode: true }, _sum: { delta: true } });
    return { new_balance: agg._sum.delta ?? 0 };
  }

  // ─── Paliers, prix et packs de crédits (§M11 : aucun prix en dur) ─────────

  @Get('billing/plans')
  async plans() {
    const rows = await this.prisma.billingPlan.findMany({ orderBy: { priceMonthly: 'asc' } });
    return rows.map((p) => ({
      code: p.code, label: p.label, price_monthly: toMajorAmount(p.priceMonthly, p.currency), price_yearly: toMajorAmount(p.priceYearly, p.currency),
      currency: p.currency, included_modules: p.includedModules, included_credits: p.includedCredits, is_active: p.isActive,
    }));
  }

  @Patch('billing/plans/:code')
  @RequireStaffRole(...STAFF_WRITE.admin)
  async updatePlan(@Param('code') code: string, @Body() body: UpdatePlanDto, @Req() req: any) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code } });
    if (!plan) throw new NotFoundException('Palier introuvable');
    const updated = await this.prisma.billingPlan.update({
      where: { code },
      data: {
        label: body.label,
        priceMonthly: body.price_monthly != null ? BigInt(body.price_monthly) : undefined,
        priceYearly: body.price_yearly != null ? BigInt(body.price_yearly) : undefined,
        includedModules: body.included_modules,
        includedCredits: body.included_credits,
        isActive: body.is_active,
      },
    });
    await this.record(req, 'billing.plan_updated', null, 'billing_plan', updated.id, { code, changes: body as Record<string, unknown> });
    return { code: updated.code, price_monthly: toMajorAmount(updated.priceMonthly, updated.currency), is_active: updated.isActive };
  }

  @Get('billing/packs')
  async packs() {
    const rows = await this.prisma.creditPack.findMany({ orderBy: { credits: 'asc' } });
    return rows.map((p) => ({ code: p.code, label: p.label, credits: p.credits, price: toMajorAmount(p.price, p.currency), currency: p.currency, is_active: p.isActive }));
  }

  @Patch('billing/packs/:code')
  @RequireStaffRole(...STAFF_WRITE.admin)
  async updatePack(@Param('code') code: string, @Body() body: UpdatePackDto, @Req() req: any) {
    const pack = await this.prisma.creditPack.findUnique({ where: { code } });
    if (!pack) throw new NotFoundException('Pack introuvable');
    const updated = await this.prisma.creditPack.update({
      where: { code },
      data: { label: body.label, credits: body.credits, price: body.price != null ? BigInt(body.price) : undefined, isActive: body.is_active },
    });
    await this.record(req, 'billing.pack_updated', null, 'credit_pack', updated.id, { code, changes: body as Record<string, unknown> });
    return { code: updated.code, credits: updated.credits, price: toMajorAmount(updated.price, updated.currency), is_active: updated.isActive };
  }
}
