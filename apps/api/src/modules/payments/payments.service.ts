import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Transaction, TransactionStatus } from '@paybrain/database';
import { detectOperator, toE164 } from '@paybrain/shared';
import { PaymentStatusResult, ProviderError } from '@paybrain/providers';
import { ApiError } from '../../common/errors/api-error';
import { decryptField, deterministicHash, encryptField, maskPhone } from '../../common/security/pii-crypto';
import { toMinor } from '../../common/money';
import { MobileMoneyOperator, MobileMoneyRegistry } from '../providers/mobile-money.registry';
import { CardAcquirerRegistry, cardPaymentsEnabled } from '../providers/card-acquirer.registry';
import { JobQueue, QUEUES } from '../../common/queue/job-queue';
import { monthlyQuota } from '../billing/monthly-quota';

/** Statut unifié fournisseur → statut stocké (correspondance 1 pour 1, §M3). */
const STORED_STATUS: Record<PaymentStatusResult['status'], TransactionStatus> = {
  pending: 'PENDING',
  succeeded: 'SUCCEEDED',
  failed: 'FAILED',
  expired: 'EXPIRED',
  canceled: 'CANCELED',
};

export function toStoredStatus(result: PaymentStatusResult): { status: TransactionStatus; failureReason?: string } {
  const status = STORED_STATUS[result.status];
  return result.failureReason ? { status, failureReason: result.failureReason } : { status };
}

/** Demande de paiement normalisée (API publique, liens, page hébergée). */
export interface InitiatePaymentInput {
  amount: number;
  currency: string;
  phone: string;
  reference: string;
  operator?: MobileMoneyOperator;
  description?: string | null;
  tillId?: string;
  paymentLinkId?: string;
}

/** Paiement par carte (§M13) : page hébergée par l'acquéreur, retour vers `returnUrl`. */
export interface InitiateCardPaymentInput {
  amount: number;
  currency: string;
  reference: string;
  description?: string | null;
  tillId?: string;
  paymentLinkId?: string;
  /** URL de retour après paiement ; une fonction la construit à partir de l'id du paiement. */
  returnUrl: string | ((transactionId: string) => string);
  cancelUrl?: string | ((transactionId: string) => string);
}

/** Un paiement carte sans réponse reste ouvert le temps de la session de l'acquéreur. */
export const CARD_EXPIRY_MS = 35 * 60_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly registry: MobileMoneyRegistry,
    @Inject(JobQueue) private readonly queue: JobQueue,
    private readonly cards: CardAcquirerRegistry,
  ) {}

  /**
   * Crée un paiement et le demande à l'opérateur. Renvoie la transaction à
   * jour. Une même référence (par marchand et par mode) renvoie le paiement
   * existant sans nouvel appel opérateur.
   */
  async initiatePayment(input: InitiatePaymentInput, merchantId: string, livemode = false): Promise<Transaction> {
    const existing = await this.prisma.transaction.findFirst({ where: { merchantId, livemode, externalId: input.reference } });
    if (existing) return existing;

    if (livemode) await this.assertLiveAllowed(merchantId);

    let phone: string;
    let operator: MobileMoneyOperator;
    try {
      phone = toE164(input.phone);
      // L'opérateur est déduit du préfixe (configuration), toujours modifiable par l'appelant (§4.2).
      operator = input.operator ?? detectOperator(phone);
    } catch (err: any) {
      throw new ApiError(400, 'telephone_invalide', err.message, 'phone');
    }

    const storeId = await this.storeOf(merchantId, input.tillId);

    const transaction = await this.prisma.transaction.create({
      data: {
        merchantId,
        operator,
        livemode,
        storeId,
        tillId: input.tillId,
        paymentLinkId: input.paymentLinkId,
        externalId: input.reference,
        amount: toMinor(input.amount, input.currency),
        currency: input.currency,
        // PII chiffrée (ALP-164) : le clair ne sert qu'à l'appel opérateur ci-dessous.
        payerPhoneEnc: new Uint8Array(encryptField(phone)),
        payerPhoneHash: new Uint8Array(deterministicHash(phone)),
        payerPhoneMask: maskPhone(phone),
        status: 'PENDING',
        payerMessage: input.description,
      },
    });

    try {
      await this.requestToProvider(transaction.id, merchantId, operator, livemode, {
        amountMinor: transaction.amount,
        currency: input.currency,
        phone,
        description: input.description,
      });
    } catch (err) {
      await this.handleRequestFailure(transaction.id, operator, livemode, err);
    }
    return this.prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
  }

  private async storeOf(merchantId: string, tillId?: string): Promise<string | undefined> {
    if (!tillId) return undefined;
    const till = await this.prisma.till.findFirst({ where: { id: tillId, merchantId, active: true }, select: { storeId: true } });
    if (!till) throw new ApiError(404, 'caisse_introuvable', 'Caisse introuvable ou désactivée', 'till_id');
    return till.storeId;
  }

  /**
   * Crée un paiement carte (§M13) : session chez l'acquéreur du marchand, puis
   * le payeur est redirigé vers `checkoutUrl`. Aucun numéro de carte ne passe
   * par AlphaPay. Même référence = même paiement (idempotent).
   */
  async initiateCardPayment(input: InitiateCardPaymentInput, merchantId: string, livemode = false): Promise<Transaction> {
    if (!cardPaymentsEnabled()) throw new ApiError(400, 'methode_indisponible', "Le paiement par carte n'est pas disponible", 'method');
    const existing = await this.prisma.transaction.findFirst({ where: { merchantId, livemode, externalId: input.reference } });
    if (existing) return existing;
    if (livemode) await this.assertLiveAllowed(merchantId);

    let acquirer;
    try {
      acquirer = await this.cards.forMerchant(merchantId, livemode);
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'not_configured') {
        throw new ApiError(422, 'carte_non_connectee', "Le paiement par carte n'est pas encore ouvert pour ce marchand (contrat carte non connecté).");
      }
      throw err;
    }

    const storeId = await this.storeOf(merchantId, input.tillId);
    const transaction = await this.prisma.transaction.create({
      data: {
        merchantId,
        operator: 'CARD',
        livemode,
        storeId,
        tillId: input.tillId,
        paymentLinkId: input.paymentLinkId,
        externalId: input.reference,
        amount: toMinor(input.amount, input.currency),
        currency: input.currency,
        status: 'PENDING',
        payerMessage: input.description,
      },
    });
    const url = (u: string | ((id: string) => string) | undefined) => (typeof u === 'function' ? u(transaction.id) : u);
    try {
      const session = await acquirer.createSession({
        amount: Number(transaction.amount),
        currency: input.currency,
        // Référence envoyée = id du paiement : un rejeu ne crée pas de doublon chez l'acquéreur (D-020).
        reference: transaction.id,
        description: input.description ?? undefined,
        returnUrl: url(input.returnUrl)!,
        cancelUrl: url(input.cancelUrl) ?? url(input.returnUrl)!,
      });
      await this.prisma.transaction.update({ where: { id: transaction.id }, data: { mtnReferenceId: session.sessionId, checkoutUrl: session.redirectUrl } });
      await this.prisma.outboxEvent.create({
        data: { transactionId: transaction.id, type: 'payment.initiated', payload: { referenceId: session.sessionId, operator: 'CARD' }, status: 'SENT' },
      });
      // Le payeur saisit sa carte : première lecture du statut après 30 s, puis intervalles croissants.
      await this.queue.enqueue(QUEUES.paymentStatus, 'poll', { transactionId: transaction.id, attempt: 0 }, { delayMs: 30_000, jobId: `poll-${transaction.id}-0` });
    } catch (err) {
      const reason = err instanceof ProviderError ? `${err.code}: ${err.message}` : (err as Error)?.message ?? 'Erreur acquéreur';
      this.logger.warn(`Session carte impossible pour ${transaction.id}: ${reason}`);
      await this.prisma.transaction.update({ where: { id: transaction.id }, data: { status: 'FAILED', failureReason: reason } });
      throw new ApiError(502, 'acquereur_indisponible', "Le paiement par carte est momentanément indisponible. Réessayez ou payez par Mobile Money.");
    }
    return this.prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
  }

  /** Mode live : KYB approuvé obligatoire (§4.6, T-61). */
  async assertLiveAllowed(merchantId: string): Promise<void> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { onboardingStatus: true } });
    if (merchant?.onboardingStatus !== 'APPROVED') {
      throw new ApiError(403, 'kyb_non_valide', 'Le mode live est disponible après validation de votre dossier (KYB).');
    }
    // Quota du palier (§M11) : un plafond tarifaire, distinct d'un impayé
    // d'abonnement, qui lui ne bloque jamais les encaissements.
    const quota = await monthlyQuota(this.prisma, merchantId);
    if (quota.limit != null && quota.used >= quota.limit) {
      throw new ApiError(403, 'limite_palier', `Limite du palier atteinte : ${quota.limit} paiements par mois pour ce marchand. Le marchand doit changer de palier pour encaisser de nouveau ce mois-ci.`);
    }
  }

  /**
   * Envoie la demande à l'opérateur. La référence envoyée est l'id de la
   * transaction : un rejeu (outbox) ne crée pas de doublon chez l'opérateur (D-020).
   */
  async requestToProvider(
    transactionId: string,
    merchantId: string,
    operator: MobileMoneyOperator,
    livemode: boolean,
    p: { amountMinor: bigint; currency: string; phone: string; description?: string | null },
  ): Promise<string> {
    const provider = await this.registry.forMerchant(merchantId, operator, livemode);
    const result = await provider.requestPayment({
      amount: Number(p.amountMinor),
      currency: p.currency,
      payerPhone: p.phone,
      reference: transactionId,
      description: p.description ?? undefined,
    });
    await this.prisma.transaction.update({ where: { id: transactionId }, data: { mtnReferenceId: result.providerRef } });
    await this.prisma.outboxEvent.create({
      data: { transactionId, type: 'payment.initiated', payload: { referenceId: result.providerRef, operator }, status: 'SENT' },
    });
    // Première relance de statut (intervalles croissants ensuite, cf. PaymentStatusPoller).
    await this.queue.enqueue(
      QUEUES.paymentStatus,
      'poll',
      { transactionId, attempt: 0 },
      { delayMs: 5_000, jobId: `poll-${transactionId}-0` },
    );
    return result.providerRef;
  }

  /**
   * Erreur réessayable (réseau, 5xx, 429) : la transaction reste en attente et
   * l'outbox rejoue la demande. Erreur définitive : la transaction échoue.
   */
  private async handleRequestFailure(transactionId: string, operator: MobileMoneyOperator, livemode: boolean, err: unknown): Promise<void> {
    if (err instanceof ProviderError && err.code === 'not_configured') {
      await this.prisma.transaction.update({ where: { id: transactionId }, data: { status: 'FAILED', failureReason: err.code } });
      throw new ApiError(422, 'operateur_non_connecte', err.message);
    }
    const reason = err instanceof ProviderError ? `${err.code}: ${err.message}` : (err as Error)?.message ?? 'Erreur opérateur';
    this.logger.warn(`Échec de la demande opérateur pour la transaction ${transactionId}: ${reason}`);

    if (err instanceof ProviderError && err.retryable) {
      await this.prisma.outboxEvent.create({
        data: { transactionId, type: 'payment.request', payload: { operator, livemode }, status: 'PENDING', lastError: reason },
      });
      return;
    }

    await this.prisma.transaction.update({ where: { id: transactionId }, data: { status: 'FAILED', failureReason: reason } });
  }

  /** Rejoue une demande opérateur depuis l'outbox (numéro déchiffré à la volée). */
  async retryRequest(transactionId: string): Promise<string> {
    const tx = await this.prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    if (!tx.payerPhoneEnc) throw new Error('Numéro du payeur absent');
    return this.requestToProvider(tx.id, tx.merchantId, tx.operator as MobileMoneyOperator, tx.livemode, {
      amountMinor: tx.amount,
      currency: tx.currency,
      phone: decryptField(tx.payerPhoneEnc),
      description: tx.payerMessage,
    });
  }

  /**
   * Lit le statut chez l'opérateur ou l'acquéreur — seule source de vérité
   * avant une transition (D-021). Carte : enregistre au passage la marque et
   * les 4 derniers chiffres renvoyés par l'acquéreur.
   */
  async fetchProviderStatus(tx: { id?: string; merchantId: string; operator: string; livemode: boolean; mtnReferenceId: string }) {
    if (tx.operator === 'CARD') {
      const acquirer = await this.cards.forMerchant(tx.merchantId, tx.livemode);
      const result = await acquirer.getSessionStatus(tx.mtnReferenceId);
      if (tx.id && result.card && (result.card.brand || result.card.last4)) {
        await this.prisma.transaction.update({ where: { id: tx.id }, data: { cardBrand: result.card.brand ?? null, cardLast4: result.card.last4 ?? null } });
      }
      return toStoredStatus(result);
    }
    const provider = await this.registry.forMerchant(tx.merchantId, tx.operator as MobileMoneyOperator, tx.livemode);
    return toStoredStatus(await provider.getPaymentStatus(tx.mtnReferenceId));
  }

  async findOne(id: string, merchantId: string, livemode: boolean): Promise<Transaction> {
    const transaction = await this.prisma.transaction.findFirst({ where: { id, merchantId, livemode } });
    if (!transaction) throw new ApiError(404, 'paiement_introuvable', 'Paiement introuvable', 'id');
    return transaction;
  }
}
