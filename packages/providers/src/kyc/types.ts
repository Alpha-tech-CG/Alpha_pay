import type { IncomingRequest } from '../mobile-money/types';

export type KycDecision = 'pending' | 'approved' | 'rejected' | 'retry';

export interface CreateApplicantInput {
  /** Identifiant AlphaPay du dossier (repris dans les webhooks). */
  externalId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface KycResult {
  decision: KycDecision;
  /** Motifs fournisseur (rejet ou reprise), sans donnée personnelle. */
  reasons?: string[];
}

export interface KycWebhookEvent extends KycResult {
  applicantId: string;
  externalId: string;
}

/**
 * Vérification d'identité du dirigeant (§M2) : création d'un demandeur, lien
 * de vérification, résultat par webhook. Adaptateurs : Sumsub (T-60) et mock.
 */
export interface KycProvider {
  readonly name: string;
  createApplicant(input: CreateApplicantInput): Promise<{ applicantId: string }>;
  createVerificationLink(applicantId: string, opts?: { ttlSeconds?: number; locale?: string }): Promise<{ url: string; expiresAt: Date }>;
  getResult(applicantId: string): Promise<KycResult>;
  /** Vérifie la signature du webhook ; lève ProviderError `invalid_signature` si elle est fausse. */
  parseWebhook(req: IncomingRequest): KycWebhookEvent | null;
}
