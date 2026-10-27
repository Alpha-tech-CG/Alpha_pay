import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { PaymentsService } from '../payments/payments.service';
import { CreatePaylinkDto } from './dto/create-paylink.dto';
import { toMajorAmount, toMinor } from '../../common/money';

@Injectable()
export class PaylinksService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly paymentsService: PaymentsService,
  ) {}

  async create(dto: CreatePaylinkDto, merchantId: string, livemode = false) {
    const expiresAt = dto.expiresInMinutes
      ? new Date(Date.now() + dto.expiresInMinutes * 60 * 1000)
      : null;

    const link = await this.prisma.paymentLink.create({
      data: { merchantId, livemode, amount: toMinor(dto.amount, dto.currency), currency: dto.currency, description: dto.description, expiresAt },
    });

    const baseUrl = process.env.CHECKOUT_URL ?? 'http://localhost:5174';
    return {
      id: link.id,
      url: `${baseUrl}/pay/${link.id}`,
      expiresAt,
    };
  }

  /** Liste les liens de paiement d'un marchand (back-office). */
  async list(merchantId: string, livemode = false) {
    const links = await this.prisma.paymentLink.findMany({
      where: { merchantId, livemode },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const now = new Date();
    return links.map((l) => {
      const expired = !!l.expiresAt && l.expiresAt < now;
      const used = !!l.usedAt;
      return {
        id: l.id,
        description: l.description,
        amount: toMajorAmount(l.amount, l.currency),
        currency: l.currency,
        active: !used && !expired,
        used,
        expired,
        // Lien à usage unique : payé => montant réglé, sinon 0.
        totalPaid: used ? toMajorAmount(l.amount, l.currency) : 0,
        createdAt: l.createdAt,
      };
    });
  }

  async findById(id: string) {
    const link = await this.prisma.paymentLink.findUnique({
      where: { id },
      include: { merchant: { select: { name: true } } },
    });

    if (!link) throw new NotFoundException('Lien introuvable');
    if (link.expiresAt && link.expiresAt < new Date()) throw new BadRequestException('Lien expiré');

    return { ...link, amount: toMajorAmount(link.amount, link.currency) };
  }

  async pay(id: string, phone: string) {
    const link = await this.findById(id);
    if (link.usedAt) throw new BadRequestException('Ce lien de paiement a déjà été utilisé');

    // Le paiement hérite du mode du lien (§4.6).
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
      link.livemode,
    );

    await this.prisma.paymentLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });

    return result;
  }
}
