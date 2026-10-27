import type { CallbackResult, IncomingRequest, PaymentStatusResult } from '../mobile-money/types';

export interface CreateCardSessionInput {
  /** Montant entier en unités mineures (D-007). */
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CardSession {
  sessionId: string;
  /** Page de paiement hébergée par le partenaire, vers laquelle le client est redirigé. */
  redirectUrl: string;
  expiresAt: Date;
}

/**
 * Acquéreur carte fondé sur une page hébergée par le partenaire (§M13).
 * Aucun numéro de carte ne transite ni n'est stocké chez AlphaPay : cette
 * interface ne manipule que des références de session (hors périmètre PCI DSS).
 */
export interface CardAcquirer {
  readonly name: string;
  createSession(input: CreateCardSessionInput): Promise<CardSession>;
  getSessionStatus(sessionId: string): Promise<PaymentStatusResult>;
  /** Vérifie la signature ; `providerRef` = sessionId. */
  parseWebhook(req: IncomingRequest): CallbackResult | null;
}
