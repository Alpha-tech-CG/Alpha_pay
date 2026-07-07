/** URL de l'API interne PayBrain, appelée uniquement côté serveur (jamais exposée au navigateur). */
export const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000';

export interface WalletQuote {
  currency: string; // devise wallet (XAF)
  amount: number; // équivalent dans la devise wallet
  rate: number; // 1 <devise du lien> = rate <devise wallet>
  formatted: string;
}

export interface Paylink {
  id: string;
  amount: number; // unités majeures (ex. 5000 = 5000 XAF)
  currency: string;
  description: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  merchant: { name: string };
  // Présent si le lien est en devise étrangère : équivalent payé par un wallet XAF.
  walletQuote?: WalletQuote | null;
}

export type PaylinkResult =
  | { state: 'ok'; link: Paylink }
  | { state: 'used'; link: Paylink }
  | { state: 'expired' }
  | { state: 'not-found' };

/** Récupère un lien de paiement côté serveur. Ne renvoie jamais l'erreur brute au client. */
export async function fetchPaylink(id: string): Promise<PaylinkResult> {
  let res: Response;
  try {
    res = await fetch(`${INTERNAL_API_URL}/paylinks/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
  } catch {
    return { state: 'not-found' };
  }

  if (res.status === 404) return { state: 'not-found' };
  if (!res.ok) {
    // findById lève une 400 « Lien expiré » — on la présente proprement.
    const body = await res.json().catch(() => ({}));
    if (typeof body?.message === 'string' && /expir/i.test(body.message)) {
      return { state: 'expired' };
    }
    return { state: 'not-found' };
  }

  const link = (await res.json()) as Paylink;
  if (link.usedAt) return { state: 'used', link };
  return { state: 'ok', link };
}

/** Formate un montant (unités majeures) selon la devise, style « numeric-data ». */
export function formatAmount(amount: number, currency: string): string {
  const value = amount.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${value} ${currency}`;
}
