/**
 * File de tâches différées (§8.2, D-008) : relances opérateur, webhooks,
 * messages, exports, relances de factures. Adossée à Redis (BullMQ) avec
 * nouvelles tentatives et file des échecs ; implémentation mémoire pour les
 * tests.
 */
export const QUEUES = {
  /** Relance du statut d'un paiement en attente auprès de l'opérateur (§M3). */
  paymentStatus: 'payment-status',
  /** Envoi d'un message (SMS, WhatsApp, email) via son fournisseur (§M9). */
  messages: 'messages',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface EnqueueOptions {
  /** Délai avant la première exécution, en ms. */
  delayMs?: number;
  /** Identifiant unique : une tâche déjà présente avec cet id n'est pas dupliquée. */
  jobId?: string;
  /** Nombre total de tentatives en cas d'erreur (défaut 5, délai exponentiel). */
  attempts?: number;
}

export interface JobContext {
  id: string;
  attemptsMade: number;
}

export type JobHandler<T = any> = (data: T, ctx: JobContext) => Promise<void>;

export abstract class JobQueue {
  abstract enqueue<T>(queue: QueueName, name: string, data: T, opts?: EnqueueOptions): Promise<void>;
  /** Enregistre le traitement d'une file. Seul le process worker démarre les traitements. */
  abstract process<T>(queue: QueueName, handler: JobHandler<T>, opts?: { concurrency?: number }): void;
  abstract close(): Promise<void>;
}

export const DEFAULT_ATTEMPTS = 5;
export const DEFAULT_BACKOFF_MS = 5_000;
