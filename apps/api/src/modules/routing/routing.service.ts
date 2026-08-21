import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethodType, PrismaClient, RoutingRule } from '@paybrain/database';
import { CreateRoutingRuleDto, SimulateRoutingDto, UpdateRoutingRuleDto } from './dto/routing.dto';

export interface RoutingDecision {
  matched: boolean;
  partnerId: string | null;
  partnerCode: string | null;
  ruleId: string | null;
  ruleName: string | null;
  reason: string;
}

/**
 * Moteur de routage (orchestration). Pour une demande de paiement, applique les
 * `RoutingRule` actives par priorité CROISSANTE et renvoie le partenaire cible
 * + la raison (loggée sur la transaction pour audit/debugging). Une condition à
 * NULL agit comme un joker.
 */
@Injectable()
export class RoutingService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  list() {
    return this.prisma.routingRule.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { partner: { select: { code: true, name: true, status: true } } },
    });
  }

  async create(dto: CreateRoutingRuleDto) {
    await this.assertPartner(dto.partnerId);
    return this.prisma.routingRule.create({
      data: { name: dto.name, partnerId: dto.partnerId, ...this.optionalFields(dto) },
    });
  }

  async update(id: string, dto: UpdateRoutingRuleDto) {
    await this.assertExists(id);
    if (dto.partnerId) await this.assertPartner(dto.partnerId);
    return this.prisma.routingRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.partnerId !== undefined ? { partnerId: dto.partnerId } : {}),
        ...this.optionalFields(dto),
      },
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.routingRule.delete({ where: { id } });
    return { ok: true };
  }

  /** Applique les règles à une demande et renvoie la décision (sans persister). */
  async route(input: SimulateRoutingDto): Promise<RoutingDecision> {
    const rules = await this.prisma.routingRule.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: { partner: { select: { code: true, status: true } } },
    });

    const amount = input.amountCents != null ? BigInt(input.amountCents) : null;
    for (const rule of rules) {
      if (!this.matches(rule, input, amount)) continue;
      // On ne route jamais vers un partenaire inactif.
      if (rule.partner.status === 'INACTIVE') continue;
      return {
        matched: true,
        partnerId: rule.partnerId,
        partnerCode: rule.partner.code,
        ruleId: rule.id,
        ruleName: rule.name,
        reason: `règle « ${rule.name} » (priorité ${rule.priority})`,
      };
    }
    return { matched: false, partnerId: null, partnerCode: null, ruleId: null, ruleName: null, reason: 'aucune règle applicable' };
  }

  private matches(rule: RoutingRule, input: SimulateRoutingDto, amount: bigint | null): boolean {
    if (rule.country && rule.country !== input.country) return false;
    if (rule.currency && rule.currency !== input.currency) return false;
    if (rule.method && rule.method !== input.method) return false;
    if (rule.merchantSegment && rule.merchantSegment !== input.merchantSegment) return false;
    if (rule.binPrefix && !(input.bin ?? '').startsWith(rule.binPrefix)) return false;
    if (rule.minAmountCents != null && (amount == null || amount < rule.minAmountCents)) return false;
    if (rule.maxAmountCents != null && (amount == null || amount > rule.maxAmountCents)) return false;
    return true;
  }

  // Champs optionnels communs à create/update (exclut name/partnerId, gérés à part).
  private optionalFields(dto: CreateRoutingRuleDto | UpdateRoutingRuleDto) {
    return {
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.method !== undefined ? { method: dto.method as PaymentMethodType } : {}),
      ...(dto.merchantSegment !== undefined ? { merchantSegment: dto.merchantSegment } : {}),
      ...(dto.binPrefix !== undefined ? { binPrefix: dto.binPrefix } : {}),
      ...(dto.minAmountCents !== undefined ? { minAmountCents: dto.minAmountCents == null ? null : BigInt(dto.minAmountCents) } : {}),
      ...(dto.maxAmountCents !== undefined ? { maxAmountCents: dto.maxAmountCents == null ? null : BigInt(dto.maxAmountCents) } : {}),
    };
  }

  private async assertExists(id: string) {
    const rule = await this.prisma.routingRule.findUnique({ where: { id }, select: { id: true } });
    if (!rule) throw new NotFoundException('Règle de routage introuvable');
  }

  private async assertPartner(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
    if (!partner) throw new NotFoundException('Partenaire cible introuvable');
  }
}
