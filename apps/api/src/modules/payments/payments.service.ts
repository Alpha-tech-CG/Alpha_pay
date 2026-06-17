import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { createMtnConnector, createAirtelConnector } from '@paybrain/connectors';
import { detectOperator, normalizePhone } from '@paybrain/shared';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { deterministicHash, encryptField, maskPhone } from '../../common/security/pii-crypto';
import { toCents, toMajor } from '../../common/money';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly mtn = createMtnConnector();
  private readonly airtel = createAirtelConnector();

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async initiatePayment(dto: CreatePaymentDto, merchantId: string) {
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

    const phone = normalizePhone(dto.phone);
    let operator: 'MTN' | 'AIRTEL';
    try {
      operator = detectOperator(phone);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        merchantId,
        operator,
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

    const connector = operator === 'MTN' ? this.mtn : this.airtel;

    try {
      const result = await connector.requestToPay({ ...dto, phone });

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { mtnReferenceId: result.referenceId },
      });
      await this.prisma.outboxEvent.create({
        data: {
          transactionId: transaction.id,
          type: 'payment.initiated',
          payload: { referenceId: result.referenceId, operator },
          status: 'SENT',
        },
      });

      return { referenceId: result.referenceId, transactionId: transaction.id, operator, status: 'PENDING' };
    } catch (err: any) {
      // Compensation: the DB write succeeded but the operator call failed —
      // roll the transaction to FAILED and queue an outbox event so the
      // dispatcher can retry without the caller having to resubmit (which
      // would violate the externalId idempotency guarantee above).
      const reason = err.response?.data?.message || err.message || 'Erreur opérateur';
      this.logger.warn(`Échec requestToPay transaction ${transaction.id}: ${reason}`);

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason: reason },
      });
      await this.prisma.outboxEvent.create({
        data: {
          transactionId: transaction.id,
          type: 'payment.failed',
          payload: { dto: { ...dto, phone }, operator },
          status: 'PENDING',
          lastError: reason,
        },
      });

      return {
        referenceId: null,
        transactionId: transaction.id,
        operator,
        status: 'FAILED',
        error: reason,
      };
    }
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
