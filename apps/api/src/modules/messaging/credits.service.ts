import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { MessageChannel, Prisma, PrismaClient } from '@paybrain/database';
import { ApiError } from '../../common/errors/api-error';

const DEFAULT_COSTS: Record<MessageChannel, number> = { SMS: 1, WHATSAPP: 1, EMAIL: 1 };

/** Crédits consommés par canal (MESSAGE_CREDIT_COSTS, JSON). Tarifs des packs : M11. */
export function creditCost(channel: MessageChannel): number {
  try {
    const custom = process.env.MESSAGE_CREDIT_COSTS ? JSON.parse(process.env.MESSAGE_CREDIT_COSTS) : {};
    const v = Number(custom[channel]);
    return Number.isInteger(v) && v >= 0 ? v : DEFAULT_COSTS[channel];
  } catch {
    return DEFAULT_COSTS[channel];
  }
}

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Crédits de messages (§M9, §M11) : registre en ajout seul, solde = somme
 * des mouvements. Le débit est sérialisé par marchand (verrou consultatif)
 * pour qu'un solde ne puisse jamais être dépensé deux fois.
 */
@Injectable()
export class CreditsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async balance(merchantId: string, livemode: boolean, tx: Tx = this.prisma): Promise<number> {
    const agg = await tx.creditLedger.aggregate({ where: { merchantId, livemode }, _sum: { delta: true } });
    return agg._sum.delta ?? 0;
  }

  /**
   * Débite `amount` crédits ; lève 402 `credits_insuffisants` si le solde ne
   * suffit pas. `tx` permet de lier le débit à la création du message.
   */
  async debit(merchantId: string, livemode: boolean, amount: number, messageId: string, tx: Prisma.TransactionClient): Promise<void> {
    if (amount <= 0) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credits:${merchantId}:${livemode}`}))`;
    const balance = await this.balance(merchantId, livemode, tx);
    if (balance < amount) {
      throw new ApiError(
        HttpStatus.PAYMENT_REQUIRED,
        'credits_insuffisants',
        `Crédits de messages insuffisants : ${amount} requis, ${balance} disponible(s).`,
      );
    }
    await tx.creditLedger.create({ data: { merchantId, livemode, delta: -amount, reason: 'message', messageId } });
  }

  /** Rend les crédits d'un message jamais accepté par le fournisseur. */
  async refund(merchantId: string, livemode: boolean, amount: number, messageId: string): Promise<void> {
    if (amount <= 0) return;
    await this.prisma.creditLedger.create({ data: { merchantId, livemode, delta: amount, reason: 'remboursement', messageId } });
  }

  async history(merchantId: string, livemode: boolean, take = 50) {
    return this.prisma.creditLedger.findMany({
      where: { merchantId, livemode },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, delta: true, reason: true, messageId: true, createdAt: true },
    });
  }
}
