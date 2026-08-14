import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { decryptField } from '../../common/security/pii-crypto';

@Injectable()
export class MerchantService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /** Profil du marchand identifié par sa clé API (back-office Settings). */
  async profile(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        name: true, emailEncrypted: true, phone: true, companyName: true,
        merchantType: true, country: true, website: true, createdAt: true,
      },
    });
    if (!m) throw new NotFoundException('Marchand introuvable');
    return {
      name: m.name,
      email: m.emailEncrypted ? decryptField(m.emailEncrypted as unknown as Buffer) : null,
      phone: m.phone,
      companyName: m.companyName,
      merchantType: m.merchantType,
      country: m.country,
      website: m.website,
      createdAt: m.createdAt,
    };
  }
}
