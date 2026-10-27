import { EnqueueOptions, JobHandler, JobQueue, QueueName } from './job-queue';

export interface InMemoryJob {
  queue: QueueName;
  name: string;
  data: unknown;
  opts: EnqueueOptions;
}

/**
 * File en mémoire pour les tests : les tâches sont enregistrées, et
 * `drain()` exécute celles d'une file avec le traitement enregistré.
 * Les identifiants déjà vus ne sont pas dupliqués, comme avec BullMQ.
 */
export class InMemoryJobQueue extends JobQueue {
  readonly jobs: InMemoryJob[] = [];
  private readonly handlers = new Map<QueueName, JobHandler>();
  private readonly seenIds = new Set<string>();

  async enqueue<T>(queue: QueueName, name: string, data: T, opts: EnqueueOptions = {}): Promise<void> {
    if (opts.jobId) {
      if (this.seenIds.has(opts.jobId)) return;
      this.seenIds.add(opts.jobId);
    }
    this.jobs.push({ queue, name, data, opts });
  }

  process<T>(queue: QueueName, handler: JobHandler<T>): void {
    this.handlers.set(queue, handler as JobHandler);
  }

  /** Exécute les tâches en attente d'une file (y compris celles qu'elles ajoutent, une passe à la fois). */
  async drain(queue: QueueName): Promise<number> {
    const handler = this.handlers.get(queue);
    if (!handler) throw new Error(`Aucun traitement enregistré pour ${queue}`);
    const pending = this.jobs.filter((j) => j.queue === queue);
    this.jobs.splice(0, this.jobs.length, ...this.jobs.filter((j) => j.queue !== queue));
    for (const job of pending) await handler(job.data, { id: job.opts.jobId ?? '', attemptsMade: 0 });
    return pending.length;
  }

  async close(): Promise<void> {}
}
