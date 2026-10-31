import { Transaction } from '@paybrain/database';
import { publicPaymentStatus } from '@paybrain/shared';
import { formatAmount, toMajorAmount } from '../../common/money';

/**
 * Représentation publique d'un paiement (§7) : jamais de champ interne
 * (numéro chiffré, haché, version). Montant en unités majeures, statut en
 * libellé public, numéro du payeur masqué.
 */
export function presentPayment(tx: Transaction) {
  return {
    id: tx.id,
    object: 'payment',
    livemode: tx.livemode,
    status: publicPaymentStatus(tx.status),
    amount: toMajorAmount(tx.amount, tx.currency),
    currency: tx.currency,
    amount_display: formatAmount(tx.amount, tx.currency),
    operator: tx.operator.toLowerCase(),
    payment_method: tx.operator === 'CARD' ? 'card' : 'mobile_money',
    payer_phone: tx.payerPhoneMask,
    card: tx.operator === 'CARD' && (tx.cardBrand || tx.cardLast4) ? { brand: tx.cardBrand, last4: tx.cardLast4 } : null,
    // Carte en attente : page de l'acquéreur où envoyer (ou renvoyer) le payeur.
    redirect_url: tx.operator === 'CARD' && tx.status === 'PENDING' ? tx.checkoutUrl : null,
    amount_refunded: toMajorAmount(tx.amountRefunded ?? 0n, tx.currency),
    reference: tx.externalId,
    description: tx.payerMessage,
    failure_reason: tx.failureReason,
    provider_reference: tx.mtnReferenceId,
    store_id: tx.storeId,
    till_id: tx.tillId,
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
  };
}

export type PublicPayment = ReturnType<typeof presentPayment>;
