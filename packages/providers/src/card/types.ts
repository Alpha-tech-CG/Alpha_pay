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

/** Ce que l'acquéreur renvoie de la carte : jamais le numéro complet. */
export interface CardDetails {
  brand?: string;
  last4?: string;
}

export interface CardStatusResult extends PaymentStatusResult {
  card?: CardDetails;
}

export interface CardRefundInput {
  sessionId: string;
  /** Montant entier en unités mineures, au plus le montant payé moins les remboursements. */
  amount: number;
  currency: string;
  /** Identifiant AlphaPay du remboursement : un rejeu ne rembourse pas deux fois. */
  reference: string;
  reason?: string;
}

export type CardRefundStatus = 'pending' | 'succeeded' | 'failed';

export interface CardRefundResult {
  refundRef: string;
  status: CardRefundStatus;
  failureReason?: string;
}

export type CardDisputeStatus = 'open' | 'under_review' | 'won' | 'lost';

export interface CardDisputeEvent {
  disputeRef: string;
  sessionId: string;
  amount: number;
  currency: string;
  reason: string;
  status: CardDisputeStatus;
  evidenceDueAt?: Date;
}

/** Événement reçu de l'acquéreur, signature déjà vérifiée. */
export type CardWebhookEvent =
  | { type: 'payment'; payment: CallbackResult }
  | { type: 'refund'; refund: CardRefundResult & { reference: string } }
  | { type: 'dispute'; dispute: CardDisputeEvent };

/**
 * Acquéreur carte fondé sur une page hébergée par le partenaire (§M13).
 * Aucun numéro de carte ne transite ni n'est stocké chez AlphaPay : cette
 * interface ne manipule que des références de session (hors périmètre PCI DSS
 * au-delà du questionnaire SAQ A). Une instance est liée au contrat d'UN
 * marchand : l'acquéreur règle les fonds directement sur son compte.
 */
export interface CardAcquirer {
  readonly name: string;
  createSession(input: CreateCardSessionInput): Promise<CardSession>;
  getSessionStatus(sessionId: string): Promise<CardStatusResult>;
  refund(input: CardRefundInput): Promise<CardRefundResult>;
  submitDisputeEvidence(disputeRef: string, text: string): Promise<void>;
  /** Vérifie la signature ; lève `invalid_signature` sinon, renvoie null si l'événement est ignoré. */
  parseWebhook(req: IncomingRequest): CardWebhookEvent | null;
}

/** Stockage de l'état d'un acquéreur factice, partagé entre l'API et le worker (Redis). */
export interface CardStateStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}
