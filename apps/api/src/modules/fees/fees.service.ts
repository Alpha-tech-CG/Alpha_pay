import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FeeRule, PaymentMethodType, PrismaClient } from '@paybrain/database';
import { CreateFeeProfileDto, CreateFeeRuleDto, SimulateFeeDto } from './dto/fees.dto';

export interface FeeComputation {
  matched: boolean;
  feeCents: string;
  currency: string;
  ruleId: string | null;
  percentBps: number;
  fixedCents: string;
  breakdown: string;
}

/**
 * Moteur de tarification : calcule la COMMISSION TECHNOLOGIQUE d'AlphaPay pour
 * une transaction (% en points de base + part fixe), à partir du profil de frais
 * du marchand (ou du profil par défaut). Ne manipule jamais les flux de fonds.
 */
@Injectable()
export class FeesService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  listProfiles() {
    return this.prisma.feeProfile.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { rules: true, _count: { select: { merchants: true } } },
    });
  }

  async getProfile(id: string) {
    const profile = await this.prisma.feeProfile.findUnique({ where: { id }, include: { rules: true } });
    if (!profile) throw new NotFoundException('Profil de frais introuvable');
    return profile;
  }

  async createProfile(dto: CreateFeeProfileDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.feeProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.feeProfile.create({ data: { name: dto.name, description: dto.description, isDefault: dto.isDefault ?? false } });
    });
  }

  async deleteProfile(id: string) {
    const assigned = await this.prisma.merchant.count({ where: { feeProfileId: id } });
    if (assigned > 0) throw new BadRequestException(`Profil affecté à ${assigned} marchand(s) — réaffectez-les d'abord`);
    await this.prisma.feeProfile.delete({ where: { id } });
    return { ok: true };
  }

  async addRule(profileId: string, dto: CreateFeeRuleDto) {
    await this.getProfile(profileId);
    return this.prisma.feeRule.create({
      data: {
        feeProfileId: profileId,
        method: dto.method as PaymentMethodType | undefined,
        partnerId: dto.partnerId,
        minAmountCents: dto.minAmountCents == null ? null : BigInt(dto.minAmountCents),
        maxAmountCents: dto.maxAmountCents == null ? null : BigInt(dto.maxAmountCents),
        percentBps: dto.percentBps ?? 0,
        fixedCents: BigInt(dto.fixedCents ?? 0),
        currency: dto.currency ?? 'XAF',
      },
    });
  }

  async removeRule(profileId: string, ruleId: string) {
    const deleted = await this.prisma.feeRule.deleteMany({ where: { id: ruleId, feeProfileId: profileId } });
    if (deleted.count === 0) throw new NotFoundException('Règle de frais introuvable');
    return { ok: true };
  }

  async assignToMerchant(merchantId: string, profileId: string | null) {
    if (profileId) await this.getProfile(profileId);
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { id: true } });
    if (!merchant) throw new NotFoundException('Marchand introuvable');
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { feeProfileId: profileId } });
    return { ok: true };
  }

  /** Résout le profil applicable (explicite → marchand → défaut) et calcule les frais. */
  async simulate(dto: SimulateFeeDto): Promise<FeeComputation> {
    let profileId = dto.feeProfileId ?? null;
    if (!profileId && dto.merchantId) {
      const merchant = await this.prisma.merchant.findUnique({ where: { id: dto.merchantId }, select: { feeProfileId: true } });
      profileId = merchant?.feeProfileId ?? null;
    }
    const profile = profileId
      ? await this.prisma.feeProfile.findUnique({ where: { id: profileId }, include: { rules: true } })
      : await this.prisma.feeProfile.findFirst({ where: { isDefault: true }, include: { rules: true } });

    if (!profile) {
      return { matched: false, feeCents: '0', currency: dto.currency, ruleId: null, percentBps: 0, fixedCents: '0', breakdown: 'aucun profil de frais applicable' };
    }
    return this.compute(profile.rules, {
      method: dto.method as PaymentMethodType | undefined,
      partnerId: dto.partnerId,
      amountCents: BigInt(dto.amountCents),
      currency: dto.currency,
    });
  }

  /** Cœur pur (testable) : choisit la règle la plus SPÉCIFIQUE qui matche, applique %+fixe. */
  compute(
    rules: FeeRule[],
    input: { method?: PaymentMethodType; partnerId?: string; amountCents: bigint; currency: string },
  ): FeeComputation {
    const candidates = rules
      .filter((r) => r.currency === input.currency)
      .filter((r) => !r.method || r.method === input.method)
      .filter((r) => !r.partnerId || r.partnerId === input.partnerId)
      .filter((r) => r.minAmountCents == null || input.amountCents >= r.minAmountCents)
      .filter((r) => r.maxAmountCents == null || input.amountCents <= r.maxAmountCents)
      .sort((a, b) => this.specificity(b) - this.specificity(a));

    const rule = candidates[0];
    if (!rule) {
      return { matched: false, feeCents: '0', currency: input.currency, ruleId: null, percentBps: 0, fixedCents: '0', breakdown: 'aucune règle applicable' };
    }
    const percentPart = (input.amountCents * BigInt(rule.percentBps)) / 10000n;
    const feeCents = percentPart + rule.fixedCents;
    return {
      matched: true,
      feeCents: feeCents.toString(),
      currency: input.currency,
      ruleId: rule.id,
      percentBps: rule.percentBps,
      fixedCents: rule.fixedCents.toString(),
      breakdown: `${rule.percentBps} bps (${percentPart}) + ${rule.fixedCents} fixe`,
    };
  }

  private specificity(rule: FeeRule): number {
    return (rule.method ? 1 : 0) + (rule.partnerId ? 1 : 0) + (rule.minAmountCents != null ? 1 : 0) + (rule.maxAmountCents != null ? 1 : 0);
  }
}
