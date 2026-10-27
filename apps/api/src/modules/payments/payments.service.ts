import { BadRequestException, Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { PrismaClient, TransactionStatus } from '@paybrain/database';
import { minorFactor, detectOperator, normalizePhone } from '@paybrain/shared';
import { PaymentStatusResult, ProviderError } from '@paybrain/providers';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { decryptField, deterministicHash, encryptField, maskPhone } from '../../common/security/pii-crypto';
import { toCents, toMajor } from '../../common/money';
import { MobileMoneyOperator, MobileMoneyRegistry } from '../providers/mobile-money.registry';

/** Statut unifié fournisseur → statut stocké (en attendant l'enum de T-44). */
const STORED_STATUS: Record<PaymentStatusResult['status'], TransactionStatus> = {
  pending: 'PENDING',
  succeeded: 'SUCCESSFUL',
  failed: 'FAILED',
  expired: 'FAILED',
  canceled: 'REJECTED',
};

export function toStoredStatus(result: PaymentStatusResult): { status: TransactionStatus; failureReason?: string } {
  const status = STORED_STATUS[result.status];
  const failureReason = result.status === 'expired' ? result.failureReason ?? 'EXPIRED' : result.failureReason;
  return failureReason ? { status, failureReason } : { status };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly registry: MobileMoneyRegistry,
  ) {}

  async initiatePayment(dto: CreatePaymentDto, merchantId: string, livemode = false) {
    const existing = await this.prisma.transaction.findFirst({
      where: { merchantId, externalId: dto.externalId },
    });
    if (existing) {
      return {
        referenceId: existing.mtnReferenceId,
        transactionId: existing.id,
        operator: existing.operator,
        status: existing.status,
        idempotent: true,
      };
    }

    const phone = `+${normalizePhone(dto.phone)}`;
    let operator: MobileMoneyOperator;
    try {
      // L'opérateur est déduit du préfixe, toujours modifiable par l'appelant (§4.2).
      operator = dto.operator ?? detectOperator(phone);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        merchantId,
        operator,
        livemode,
        externalId: dto.externalId,
        amount: toCents(dto.amount),
        currency: dto.currency,
        // PII chiffrée (ALP-164) : le clair ne sert qu'à l'appel opérateur ci-dessous.
        payerPhoneEnc: new Uint8Array(encryptField(phone)),
        payerPhoneHash: new Uint8Array(deterministicHash(phone)),
        payerPhoneMask: maskPhone(phone),
        status: 'PENDING',
        payerMessage: dto.description,
      },
    });

    try {
      const providerRef = await this.requestToProvider(transaction.id, merchantId, operator, livemode, {
        amount: dto.amount,
        currency: dto.currency,
        phone,
        description: dto.description,
      });
      return { referenceId: providerRef, transactionId: transaction.id, operator, status: 'PENDING' };
    } catch (err) {
      return this.handleRequestFailure(transaction.id, operator, livemode, err);
    }
  }

  /**
   * Envoie la demande à l'opérateur. La référence envoyée est l'id de la
   * transaction : un rejeu (outbox) ne crée pas de doublon chez l'opérateur (D-020).
   */
  async requestToProvider(
    transactionId: string,
    merchantId: string,
    operator: MobileMoneyOperator,
    livemode: boolean,
    p: { amount: number; currency: string; phone: string; description?: string | null },
  ): Promise<string> {
    const provider = await this.registry.forMerchant(merchantId, operator, livemode);
    const result = await provider.requestPayment({
      amount: p.amount * minorFactor(p.currency),
      currency: p.currency,
      payerPhone: p.phone,
      reference: transactionId,
      description: p.description ?? undefined,
    });
    await this.prisma.transaction.update({ where: { id: transactionId }, data: { mtnReferenceId: result.providerRef } });
    await this.prisma.outboxEvent.create({
      data: { transactionId, type: 'payment.initiated', payload: { referenceId: result.providerRef, operator }, status: 'SENT' },
    });
    return result.providerRef;
  }

  /**
   * Erreur réessayable (réseau, 5xx, 429) : la transaction reste en attente et
   * l'outbox rejoue la demande. Erreur définitive : la transaction échoue.
   */
  private async handleRequestFailure(transactionId: string, operator: MobileMoneyOperator, livemode: boolean, err: unknown) {
    if (err instanceof ProviderError && err.code === 'not_configured') {
      await this.prisma.transaction.update({ where: { id: transactionId }, data: { status: 'FAILED', failureReason: err.code } });
      throw new UnprocessableEntityException({ code: 'operateur_non_connecte', message: err.message });
    }
    const reason = err instanceof ProviderError ? `${err.code}: ${err.message}` : (err as Error)?.message ?? 'Erreur opérateur';
    this.logger.warn(`Échec de la demande opérateur pour la transaction ${transactionId}: ${reason}`);

    if (err instanceof ProviderError && err.retryable) {
      await this.prisma.outboxEvent.create({
        data: { transactionId, type: 'payment.request', payload: { operator, livemode }, status: 'PENDING', lastError: reason },
      });
      return { referenceId: null, transactionId, operator, status: 'PENDING', retrying: true };
    }

    await this.prisma.transaction.update({ where: { id: transactionId }, data: { status: 'FAILED', failureReason: reason } });
    return { referenceId: null, transactionId, operator, status: 'FAILED', error: reason };
  }

  /** Rejoue une demande opérateur depuis l'outbox (numéro déchiffré à la volée). */
  async retryRequest(transactionId: string): Promise<string> {
    const tx = await this.prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (!tx.payerPhoneEnc) throw new Error('Numéro du payeur absent');
    return this.requestToProvider(tx.id, tx.merchantId, tx.operator as MobileMoneyOperator, tx.livemode, {
      amount: toMajor(tx.amount),
      currency: tx.currency,
      phone: decryptField(tx.payerPhoneEnc),
      description: tx.payerMessage,
    });
  }

  /** Lit le statut chez l'opérateur — seule source de vérité avant une transition (D-021). */
  async fetchProviderStatus(tx: { merchantId: string; operator: string; livemode: boolean; mtnReferenceId: string }) {
    const provider = await this.registry.forMerchant(tx.merchantId, tx.operator as MobileMoneyOperator, tx.livemode);
    return toStoredStatus(await provider.getPaymentStatus(tx.mtnReferenceId));
  }

  async getStatus(referenceId: string, merchantId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { mtnReferenceId: referenceId, merchantId },
    });
    if (!transaction) throw new BadRequestException('Transaction introuvable');
    // Expose le montant en unités majeures (centimes en interne).
    return { ...transaction, amount: toMajor(transaction.amount) };
  }
}
