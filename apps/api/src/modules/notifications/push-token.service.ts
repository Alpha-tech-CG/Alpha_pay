import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@paybrain/database';

@Injectable()
export class PushTokenService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async upsert(merchantId: string, token: string, platform: string) {
    await this.prisma.pushToken.upsert({
      where: { merchantId_token: { merchantId, token } },
      create: { merchantId, token, platform },
      update: { platform },
    });
    return { ok: true };
  }

  async getTokensForMerchant(merchantId: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({
      where: { merchantId },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }
}
