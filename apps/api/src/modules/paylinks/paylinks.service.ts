import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaClient } from '@paybrain/database';
import { PaymentsService } from '../payments/payments.service';
import { CreatePaylinkDto } from './dto/create-paylink.dto';
import { toCents, toMajor } from '../../common/money';

@Injectable()
export class PaylinksService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly paymentsService: PaymentsService,
  ) {}

  /** Code numérique court (8 chiffres) composable sur un téléphone à touches via USSD. */
  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = String(randomInt(10_000_000, 100_000_000)); // 8 chiffres
      const exists = await this.prisma.paymentLink.findUnique({ where: { code } });
      if (!exists) return code;
    }
    throw new Error('Impossible de générer un code de paiement unique');
  }

  async create(dto: CreatePaylinkDto, merchantId: string) {
    const expiresAt = dto.expiresInMinutes
      ? new Date(Date.now() + dto.expiresInMinutes * 60 * 1000)
      : null;

    const code = await this.generateUniqueCode();
    const link = await this.prisma.paymentLink.create({
      data: { merchantId, amount: toCents(dto.amount), currency: dto.currency, description: dto.description, code, expiresAt },
    });

    const baseUrl = process.env.CHECKOUT_URL ?? 'http://localhost:5174';
    const ussdShortcode = process.env.USSD_SHORTCODE ?? '*182#';

    // Payload JSON encodé dans le QR code — parsé par le scanner wallet client.
    // Format attendu par parseQrPayload() dans wallet.service.ts.
    const qrPayload = JSON.stringify({
      merchantId,
      amountCents: toCents(dto.amount),
      ...(dto.description ? { description: dto.description } : {}),
    });

    return {
      id: link.id,
      url: `${baseUrl}/pay/${link.id}`,
      code,
      ussd: `${ussdShortcode} puis code ${code}`,
      expiresAt,
      qrPayload,
    };
  }

  async findById(id: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { id },
      include: { merchant: { select: { name: true } } },
    });

    if (!link) throw new NotFoundException('Lien introuvable');
    if (link.expiresAt && link.expiresAt < new Date()) throw new BadRequestException('Lien expiré');

    return { ...link, amount: toMajor(link.amount) };
  }

  async pay(id: string, phone: string) {
    const link = await this.findById(id);
    if (link.usedAt) throw new BadRequestException('Ce lien de paiement a déjà été utilisé');

    const result = await this.paymentsService.initiatePayment(
      {
        // findById renvoie déjà le montant en unités majeures.
        amount: link.amount,
        currency: link.currency,
        phone,
        externalId: `paylink-${link.id}`,
        description: link.description,
      },
      link.merchantId,
    );

    await this.prisma.paymentLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });

    return result;
  }
}
