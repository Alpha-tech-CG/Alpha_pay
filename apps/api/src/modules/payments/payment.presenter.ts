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
    payer_phone: tx.payerPhoneMask,
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
