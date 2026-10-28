import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

export function cardPaymentsEnabled(): boolean {
  return process.env.FEATURE_CARD_PAYMENTS === 'true';
}

export interface CardSessionParams {
  merchantId: string;
  amount: number;
  currency: string;
  reference: string;
  returnUrl: string;
}

export interface CardSession {
  sessionId: string;
  redirectUrl: string;
  expiresAt: Date;
}

@Injectable()
export class CardAcquirerService {
  /**
   * Crée une session de paiement carte chez le partenaire acquéreur.
   * En mode mock (CARD_ACQUIRER_MOCK=true ou absence de CARD_ACQUIRER_URL),
   * redirige vers la page mock locale.
   */
  async createSession(params: CardSessionParams): Promise<CardSession> {
    const sessionId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60_000);

    if (this.isMock()) {
      return {
        sessionId,
        redirectUrl: `/mock/card/${sessionId}?amount=${params.amount}&currency=${params.currency}&ref=${encodeURIComponent(params.reference)}&return=${encodeURIComponent(params.returnUrl)}`,
        expiresAt,
      };
    }

    const acquirerUrl = process.env.CARD_ACQUIRER_URL!;
    const secret = process.env.CARD_ACQUIRER_SECRET ?? '';
    const sig = createHash('sha256')
      .update(`${sessionId}:${params.amount}:${params.reference}:${secret}`)
      .digest('hex');

    return {
      sessionId,
      redirectUrl: `${acquirerUrl}/pay?session=${sessionId}&sig=${sig}`,
      expiresAt,
    };
  }

  isMock(): boolean {
    return process.env.CARD_ACQUIRER_MOCK === 'true' || !process.env.CARD_ACQUIRER_URL;
  }
}
