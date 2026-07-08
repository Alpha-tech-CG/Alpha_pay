import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient, WalletKycLevel } from '@paybrain/database';

export interface WalletLimit {
  maxBalanceCents: bigint;
  perTxCents: bigint;
  dailyCents: bigint;
  monthlyCents: bigint;
}

// Défauts de secours si la table wallet_limits n'est pas encore seedée
// (centimes ×100, XAF). Alignés sur la migration 11.
const FALLBACK_LIMITS: Record<WalletKycLevel, WalletLimit> = {
  N0: { maxBalanceCents: 10_000_000n, perTxCents: 5_000_000n, dailyCents: 5_000_000n, monthlyCents: 20_000_000n },
  N1: { maxBalanceCents: 200_000_000n, perTxCents: 50_000_000n, dailyCents: 100_000_000n, monthlyCents: 500_000_000n },
  N2: { maxBalanceCents: 1_000_000_000n, perTxCents: 200_000_000n, dailyCents: 500_000_000n, monthlyCents: 2_000_000_000n },
};

// Types de transaction qui réduisent le solde (comptés dans les volumes sortants).
const OUTGOING_TYPES = ['PAY', 'CASH_OUT', 'P2P_SEND'] as const;

/**
 * Plafonds e-money par niveau KYC (ALP-174).
 *
 * Deux natures de limites :
 *  - **Plafond de solde** (stock) : le solde ne peut pas dépasser maxBalance —
 *    vérifié sur les crédits (cash-in, réception P2P).
 *  - **Volume sortant** (flux) : montant par opération + total glissant sur
 *    24 h et 30 j — vérifié sur les débits (paiement, retrait, envoi P2P).
 *
 * Les seuils sont lus depuis la table `wallet_limits`, éditable sans redéploiement.
 */
@Injectable()
export class WalletLimitsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async getLimit(level: WalletKycLevel): Promise<WalletLimit> {
    const row = await this.prisma.walletLimit.findUnique({ where: { level } });
    if (!row) return FALLBACK_LIMITS[level];
    return {
      maxBalanceCents: row.maxBalanceCents,
      perTxCents: row.perTxCents,
      dailyCents: row.dailyCents,
      monthlyCents: row.monthlyCents,
    };
  }

  /** Vérifie qu'un crédit ne fait pas dépasser le plafond de solde du niveau. */
  async assertWithinBalanceCap(level: WalletKycLevel, currentBalanceCents: bigint, creditCents: bigint) {
    const limit = await this.getLimit(level);
    if (currentBalanceCents + creditCents > limit.maxBalanceCents) {
      throw new ForbiddenException(
        `Plafond de solde atteint (niveau ${level}). Vérifiez votre identité pour l'augmenter.`,
      );
    }
  }

  /** Vérifie qu'un débit respecte le montant par opération + les volumes 24h / 30j. */
  async assertWithinDebitLimits(walletId: string, level: WalletKycLevel, amountCents: bigint) {
    const limit = await this.getLimit(level);

    if (amountCents > limit.perTxCents) {
      throw new ForbiddenException(
        `Montant supérieur à la limite par opération (niveau ${level}). Vérifiez votre identité pour l'augmenter.`,
      );
    }

    const now = Date.now();
    const [dailySpent, monthlySpent] = await Promise.all([
      this.#outgoingSince(walletId, new Date(now - 24 * 3600 * 1000)),
      this.#outgoingSince(walletId, new Date(now - 30 * 24 * 3600 * 1000)),
    ]);

    if (dailySpent + amountCents > limit.dailyCents) {
      throw new ForbiddenException(
        `Plafond journalier atteint (niveau ${level}). Réessayez demain ou vérifiez votre identité.`,
      );
    }
    if (monthlySpent + amountCents > limit.monthlyCents) {
      throw new ForbiddenException(
        `Plafond mensuel atteint (niveau ${level}). Vérifiez votre identité pour l'augmenter.`,
      );
    }
  }

  /** Somme des débits (PAY/CASH_OUT/P2P_SEND) depuis `since`.
      CASH_OUT compté dès PENDING (débité immédiatement). */
  async #outgoingSince(walletId: string, since: Date): Promise<bigint> {
    const rows = await this.prisma.walletTransaction.groupBy({
      by: ['type', 'status'],
      where: { walletId, type: { in: [...OUTGOING_TYPES] }, createdAt: { gte: since } },
      _sum: { amountCents: true },
    });
    let total = 0n;
    for (const r of rows) {
      const counted =
        (r.type === 'CASH_OUT' && (r.status === 'PENDING' || r.status === 'SUCCESSFUL')) ||
        ((r.type === 'PAY' || r.type === 'P2P_SEND') && r.status === 'SUCCESSFUL');
      if (counted) total += r._sum.amountCents ?? 0n;
    }
    return total;
  }

  /** Met à jour les plafonds d'un niveau (endpoint interne). */
  async upsertLimit(level: WalletKycLevel, data: WalletLimit) {
    for (const v of [data.maxBalanceCents, data.perTxCents, data.dailyCents, data.monthlyCents]) {
      if (v < 0n) throw new BadRequestException('Les plafonds doivent être positifs');
    }
    return this.prisma.walletLimit.upsert({
      where: { level },
      update: { ...data },
      create: { level, ...data },
    });
  }

  listLimits() {
    return this.prisma.walletLimit.findMany({ orderBy: { level: 'asc' } });
  }
}
