import { PrismaClient } from '@paybrain/database';

/** Brazzaville : UTC+1 fixe, sans heure d'été (§8.5). */
const OFFSET_MS = 3_600_000;

/** Premier instant du mois en cours à l'heure de Brazzaville, en UTC. */
export function monthStart(now = new Date()): Date {
  const local = new Date(now.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET_MS);
}

export interface MonthlyQuota {
  /** Plafond du palier ; null = illimité. */
  limit: number | null;
  /** Paiements live réussis depuis le début du mois. */
  used: number;
}

/**
 * Quota mensuel de transactions du palier (§M11, palier Gratuit). Seuls les
 * paiements live réussis comptent : une tentative échouée ou un paiement test
 * ne consomme rien. Le compte marchand d'AlphaPay n'est jamais plafonné.
 */
export async function monthlyQuota(prisma: PrismaClient, merchantId: string, now = new Date()): Promise<MonthlyQuota> {
  if (merchantId === process.env.ALPHAPAY_BILLING_MERCHANT_ID) return { limit: null, used: 0 };
  const sub = await prisma.subscription.findUnique({ where: { merchantId }, include: { plan: true } });
  const plan = sub?.plan ?? (await prisma.billingPlan.findUnique({ where: { code: 'gratuit' } }));
  const limit = plan?.maxMonthlyTransactions ?? null;
  if (limit == null) return { limit: null, used: 0 };
  const used = await prisma.transaction.count({
    where: { merchantId, livemode: true, status: 'SUCCEEDED', createdAt: { gte: monthStart(now) } },
  });
  return { limit, used };
}
