import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaClient, SettlementStatus } from '@paybrain/database';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationService } from '../notifications/notification.service';
import { WebhookDeliveryService } from '../webhooks-out/webhook-delivery.service';
import { toMajor } from '../../common/money';

// Seuil au-delà duquel la double validation (4-eyes) est requise.
const DOUBLE_VALIDATION_THRESHOLD_CENTS = 500_000n * 100n; // 500 000 FCFA

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationService,
    private readonly webhooks: WebhookDeliveryService,
  ) {}

  async getConfig(merchantId: string) {
    const config = await this.prisma.merchantSettlementConfig.findUnique({ where: { merchantId } });
    return config ?? { merchantId, frequency: 'T1', minAmountCents: 0n, commissionBps: 150, dayOfWeek: null, enabled: true };
  }

  async upsertConfig(merchantId: string, data: { frequency?: any; minAmountCents?: number; commissionBps?: number; dayOfWeek?: number; enabled?: boolean }) {
    return this.prisma.merchantSettlementConfig.upsert({
      where: { merchantId },
      update: {
        ...(data.frequency ? { frequency: data.frequency } : {}),
        ...(data.minAmountCents != null ? { minAmountCents: BigInt(data.minAmountCents) } : {}),
        ...(data.commissionBps != null ? { commissionBps: data.commissionBps } : {}),
        ...(data.dayOfWeek != null ? { dayOfWeek: data.dayOfWeek } : {}),
        ...(data.enabled != null ? { enabled: data.enabled } : {}),
      },
      create: {
        merchantId,
        frequency: data.frequency ?? 'T1',
        minAmountCents: BigInt(data.minAmountCents ?? 0),
        commissionBps: data.commissionBps ?? 150,
        dayOfWeek: data.dayOfWeek ?? null,
        enabled: data.enabled ?? true,
      },
    });
  }

  /**
   * Calcule le solde net (encaissements − commission − retenues) d'un marchand
   * sur une période et crée un batch de reversement si le seuil minimum est
   * atteint. Trace l'écriture comptable (débit wallet marchand → crédit transit).
   */
  async run(merchantId: string, periodStart: Date, periodEnd: Date) {
    const config = await this.getConfig(merchantId);

    const txns = await this.prisma.transaction.findMany({
      where: { merchantId, status: 'SUCCESSFUL', createdAt: { gte: periodStart, lt: periodEnd } },
      select: { amount: true, currency: true },
    });
    if (txns.length === 0) return { created: false, reason: 'aucun encaissement sur la période' };

    const currency = txns[0].currency;
    const grossCents = txns.reduce((s, t) => s + t.amount, 0n);
    const commissionCents = (grossCents * BigInt(config.commissionBps)) / 10000n;
    const holdsCents = 0n;
    const netCents = grossCents - commissionCents - holdsCents;

    if (netCents < BigInt(config.minAmountCents)) {
      return { created: false, reason: `net ${netCents} < seuil minimum ${config.minAmountCents}` };
    }

    const requiresDoubleValidation = netCents > DOUBLE_VALIDATION_THRESHOLD_CENTS;
    const status: SettlementStatus = requiresDoubleValidation ? 'PENDING_VALIDATION' : 'INITIATED';
    const batchNumber = `STL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex')}`;

    const batch = await this.prisma.settlementBatch.create({
      data: {
        batchNumber, merchantId, periodStart, periodEnd, currency,
        grossCents, commissionCents, holdsCents, netCents, status, requiresDoubleValidation,
        audits: { create: { action: 'CREATED', actor: 'system', details: `net ${netCents} centimes` } },
      },
    });

    // Traçabilité comptable : débit wallet marchand → crédit compte de transit.
    await this.ledger.postEntry([
      { accountId: `merchant-wallet-${merchantId}`, direction: 'DEBIT', amount: toMajor(netCents), currency, description: `settlement ${batchNumber}` },
      { accountId: 'settlement-transit', direction: 'CREDIT', amount: toMajor(netCents), currency, description: `settlement ${batchNumber}` },
    ]);

    this.logger.log(`Batch ${batchNumber} créé (${status}) net ${netCents} centimes pour ${merchantId}`);
    return { created: true, batchId: batch.id, batchNumber, status, netCents: netCents.toString(), requiresDoubleValidation };
  }

  /** Double validation (4-eyes) : 2 validateurs distincts requis si seuil dépassé. */
  async validate(batchId: string, validatorId: string) {
    const batch = await this.requireBatch(batchId);
    if (batch.status !== 'PENDING_VALIDATION') {
      throw new BadRequestException(`Batch non en attente de validation (statut ${batch.status})`);
    }
    if (batch.validatedBy.includes(validatorId)) {
      throw new ForbiddenException('Validateur déjà enregistré — il faut un second validateur distinct');
    }
    const validatedBy = [...batch.validatedBy, validatorId];
    const enough = validatedBy.length >= (batch.requiresDoubleValidation ? 2 : 1);

    const updated = await this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: {
        validatedBy,
        status: enough ? 'INITIATED' : 'PENDING_VALIDATION',
        audits: { create: { action: 'VALIDATED', actor: validatorId } },
      },
    });
    return { id: batchId, status: updated.status, validators: validatedBy.length };
  }

  /** Émet l'ordre de paiement externe (décaissement banque/MoMo = stub). */
  async send(batchId: string) {
    const batch = await this.requireBatch(batchId);
    if (batch.status !== 'INITIATED') throw new BadRequestException(`Batch non prêt à l'envoi (statut ${batch.status})`);

    // Écriture : débit transit → crédit compte de paiement externe.
    await this.ledger.postEntry([
      { accountId: 'settlement-transit', direction: 'DEBIT', amount: toMajor(batch.netCents), currency: batch.currency, description: `payout ${batch.batchNumber}` },
      { accountId: 'payout-external', direction: 'CREDIT', amount: toMajor(batch.netCents), currency: batch.currency, description: `payout ${batch.batchNumber}` },
    ]);

    // TODO : décaissement réel (API banque / MoMo disbursement). Stub -> SENT.
    await this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: { status: 'SENT', sentAt: new Date(), audits: { create: { action: 'SENT', actor: 'system' } } },
    });
    return { id: batchId, status: 'SENT' };
  }

  /** Confirme le settlement et notifie le marchand (email + webhook). */
  async confirm(batchId: string) {
    const batch = await this.requireBatch(batchId);
    if (batch.status !== 'SENT') throw new BadRequestException(`Batch non envoyé (statut ${batch.status})`);

    await this.prisma.settlementBatch.update({
      where: { id: batchId },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), audits: { create: { action: 'CONFIRMED', actor: 'system' } } },
    });

    const merchant = await this.prisma.merchant.findUnique({ where: { id: batch.merchantId }, select: { email: true } });
    const data = { batchNumber: batch.batchNumber, amount: toMajor(batch.netCents), currency: batch.currency };
    if (merchant?.email) {
      await this.notifications.send({ channel: 'EMAIL', to: merchant.email, template: 'payment.succeeded', category: 'settlement', merchantId: batch.merchantId, data: { externalId: batch.batchNumber, amount: data.amount, currency: data.currency } });
    }
    await this.webhooks.dispatch(batch.merchantId, 'payment.succeeded', { type: 'settlement.confirmed', ...data });

    return { id: batchId, status: 'CONFIRMED' };
  }

  listBatches() {
    return this.prisma.settlementBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async getBatch(id: string) {
    const batch = await this.prisma.settlementBatch.findUnique({ where: { id }, include: { audits: true } });
    if (!batch) throw new NotFoundException('Batch introuvable');
    return batch;
  }

  private async requireBatch(id: string) {
    const batch = await this.prisma.settlementBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('Batch introuvable');
    return batch;
  }
}
