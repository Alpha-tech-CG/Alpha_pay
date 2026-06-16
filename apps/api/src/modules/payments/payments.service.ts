import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { createMtnConnector, createAirtelConnector } from '@paybrain/connectors';
import { detectOperator, normalizePhone } from '@paybrain/shared';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly mtn = createMtnConnector();
  private readonly airtel = createAirtelConnector();

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async initiatePayment(dto: CreatePaymentDto, merchantId: string) {
    const phone = normalizePhone(dto.phone);
    let operator: 'MTN' | 'AIRTEL';

    try {
      operator = detectOperator(phone);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }

    const connector = operator === 'MTN' ? this.mtn : this.airtel;
    const result = await connector.requestToPay({ ...dto, phone });

    const transaction = await this.prisma.transaction.create({
      data: {
        merchantId,
        mtnReferenceId: result.referenceId,
        externalId: dto.externalId,
        amount: dto.amount,
        currency: dto.currency,
        payerPhone: phone,
        status: 'PENDING',
        payerMessage: dto.description,
      },
    });

    return { referenceId: result.referenceId, transactionId: transaction.id, operator, status: 'PENDING' };
  }

  async getStatus(referenceId: string, merchantId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { mtnReferenceId: referenceId, merchantId },
    });
    if (!transaction) throw new BadRequestException('Transaction introuvable');
    return transaction;
  }
}
