import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';

@Injectable()
export class PaylinksService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async create(dto: { amount: number; currency: string; description: string; expiresInMinutes?: number }, merchantId: string) {
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
}
