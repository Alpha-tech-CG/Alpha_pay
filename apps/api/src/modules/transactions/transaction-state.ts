import { PrismaClient, TransactionStatus } from '@paybrain/database';

/**
 * Machine d'état stricte des transactions (ALP-167).
 *
 * PENDING peut aller vers un état terminal ; les états terminaux sont définitifs.
 * Empêche le scénario « SUCCESSFUL puis re-PENDING » (le dernier écrivain gagne).
 */
export const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  PENDING: ['SUCCESSFUL', 'FAILED', 'REJECTED'],
  SUCCESSFUL: [],
  FAILED: [],
  REJECTED: [],
};

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: TransactionStatus,
    readonly to: TransactionStatus,
  ) {
    super(`Transition illégale ${from} -> ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export class ConcurrentModificationError extends Error {
  constructor() {
    super('Transaction modifiée en parallèle (conflit de version)');
    this.name = 'ConcurrentModificationError';
  }
}

export function isTransitionAllowed(from: TransactionStatus, to: TransactionStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionResult {
  changed: boolean;
  status: TransactionStatus;
}

/**
 * Applique une transition de statut de façon sûre :
 *  - transaction SERIALIZABLE
 *  - SELECT ... FOR UPDATE pour verrouiller la ligne (anti-race)
 *  - vérification de la machine d'état (transition illégale -> throw)
 *  - optimistic locking via `version` (CAS) : conflit -> ConcurrentModificationError
 *  - écriture d'un audit de transition
 *
 * Idempotent : si la transaction est déjà dans l'état cible, renvoie changed:false
 * sans erreur (utile pour les webhooks rejoués / concurrents).
 */
export async function transitionStatus(
  prisma: PrismaClient,
  transactionId: string,
  toStatus: TransactionStatus,
  extra: { reason?: string; failureReason?: string | null; mtnReferenceId?: string } = {},
): Promise<TransitionResult> {
  return prisma.$transaction(
    async (tx) => {
      // Verrou pessimiste sur la ligne ciblée.
      const locked = await tx.$queryRaw<{ id: string; status: TransactionStatus; version: number }[]>`
        SELECT id, status, version FROM transactions WHERE id = ${transactionId} FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new Error(`Transaction ${transactionId} introuvable`);
      }
      const current = locked[0];

      // Déjà dans l'état cible : no-op idempotent.
      if (current.status === toStatus) {
        return { changed: false, status: current.status };
      }

      if (!isTransitionAllowed(current.status, toStatus)) {
        throw new IllegalTransitionError(current.status, toStatus);
      }

      // CAS sur la version (défense en profondeur au-delà du verrou).
      const updated = await tx.transaction.updateMany({
        where: { id: transactionId, version: current.version },
        data: {
          status: toStatus,
          version: { increment: 1 },
          ...(extra.failureReason !== undefined ? { failureReason: extra.failureReason } : {}),
          ...(extra.mtnReferenceId !== undefined ? { mtnReferenceId: extra.mtnReferenceId } : {}),
        },
      });
      if (updated.count === 0) {
        throw new ConcurrentModificationError();
      }

      await tx.transactionAudit.create({
        data: { transactionId, fromStatus: current.status, toStatus, reason: extra.reason },
      });

      return { changed: true, status: toStatus };
    },
    { isolationLevel: 'Serializable' },
  );
}
