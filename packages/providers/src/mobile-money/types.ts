import type { HttpClient } from '../core/http';
import type { TokenCache } from '../core/token-cache';

/** Statuts unifiés AlphaPay (D-016). Libellés français exposés par l'API publique. */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'expired' | 'canceled';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ['pending', 'succeeded', 'failed', 'expired', 'canceled'];
export const FINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = ['succeeded', 'failed', 'expired', 'canceled'];

export interface RequestPaymentInput {
  /** Montant entier en unités mineures de la devise (D-007). */
  amount: number;
  currency: string;
  /** Numéro du payeur au format E.164 (+242…). */
  payerPhone: string;
  /** Référence AlphaPay unique du paiement ; rejouer la même référence ne crée pas de doublon. */
  reference: string;
  description?: string;
}

export interface RequestPaymentResult {
  providerRef: string;
  status: PaymentStatus;
}

export interface PaymentStatusResult {
  status: PaymentStatus;
  failureReason?: string;
}

export interface AccountHolderResult {
  active: boolean;
  name?: string;
}

/** Requête entrante (callback opérateur, webhook fournisseur) indépendante du framework HTTP. */
export interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  /** Corps brut, nécessaire pour vérifier une signature HMAC. */
  rawBody?: string;
}

export interface CallbackResult {
  providerRef: string;
  status: PaymentStatus;
  failureReason?: string;
}

/**
 * Interface commune des opérateurs Mobile Money (§M3). Une instance est liée
 * aux identifiants d'UN marchand : les fonds arrivent sur son propre compte
 * (contrainte fondatrice, §4.3).
 *
 * Un callback n'est jamais cru sur parole : l'appelant confirme toujours le
 * statut final par `getPaymentStatus` avant de le marquer réussi.
 */
export interface MobileMoneyProvider {
  readonly operator: string;
  requestPayment(input: RequestPaymentInput): Promise<RequestPaymentResult>;
  getPaymentStatus(providerRef: string): Promise<PaymentStatusResult>;
  /** Présent si l'opérateur le permet. */
  verifyAccountHolder?(phone: string): Promise<AccountHolderResult>;
  /** Présent si l'opérateur envoie des callbacks ; renvoie null si la requête n'est pas exploitable. */
  parseCallback?(req: IncomingRequest): CallbackResult | null;
}

/** Connexion opérateur d'un marchand (identifiants déjà déchiffrés). */
export interface MobileMoneyConnection {
  environment: 'sandbox' | 'production';
  credentials: Record<string, string>;
  /** URL de callback AlphaPay transmise à l'opérateur, si applicable. */
  callbackUrl?: string;
}

export interface ProviderDeps {
  http?: HttpClient;
  tokenCache?: TokenCache;
  now?: () => number;
  /** Pause entre deux tentatives (remplaçable dans les tests). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Fabrique d'adaptateur : seul point qui sait transformer une connexion
 * marchand en identifiants opérateur (D-006). Ajouter un opérateur = ajouter
 * une fabrique, sans toucher au reste du code.
 */
export interface MobileMoneyProviderFactory {
  readonly operator: string;
  readonly requiredCredentials: readonly string[];
  create(connection: MobileMoneyConnection, deps?: ProviderDeps): MobileMoneyProvider;
}
