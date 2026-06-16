import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { PaymentsService } from '../payments/payments.service';
import { CreatePaylinkDto } from './dto/create-paylink.dto';

@Injectable()
export class PaylinksService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(dto: CreatePaylinkDto, merchantId: string) {
    const expiresAt = dto.expiresInMinutes
      ? new Date(Date.now() + dto.expiresInMinutes * 60 * 1000)
      : null;

    const link = await this.prisma.paymentLink.create({
      data: { merchantId, amount: dto.amount, currency: dto.currency, description: dto.description, expiresAt },
    });

    const baseUrl = process.env.CHECKOUT_URL ?? 'http://localhost:5174';
    return { id: link.id, url: `${baseUrl}/pay/${link.id}`, expiresAt };
  }

  async findById(id: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { id },
      include: { merchant: { select: { name: true } } },
    });

    if (!link) throw new NotFoundException('Lien introuvable');
    if (link.expiresAt && link.expiresAt < new Date()) throw new BadRequestException('Lien expiré');

    return link;
  }

  async pay(id: string, phone: string) {
    const link = await this.findById(id);
    if (link.usedAt) throw new BadRequestException('Ce lien de paiement a déjà été utilisé');

    const result = await this.paymentsService.initiatePayment(
      {
        amount: Number(link.amount),
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
