import { DEFAULT_ATTEMPTS, EnqueueOptions, JobHandler, JobQueue, QueueName } from './job-queue';

export interface InMemoryJob {
  queue: QueueName;
  name: string;
  data: unknown;
  opts: EnqueueOptions;
  attemptsMade: number;
}

/**
 * File en mémoire pour les tests : les tâches sont enregistrées, et
 * `drain()` les exécute avec le traitement enregistré. Comme BullMQ, une
 * tâche qui lève est réessayée jusqu'à `attempts`, puis rangée dans `failed` ;
 * les identifiants déjà vus ne sont pas dupliqués.
 */
export class InMemoryJobQueue extends JobQueue {
  readonly jobs: InMemoryJob[] = [];
  readonly failed: Array<InMemoryJob & { error: unknown }> = [];
  private readonly handlers = new Map<QueueName, JobHandler>();
  private readonly seenIds = new Set<string>();

  async enqueue<T>(queue: QueueName, name: string, data: T, opts: EnqueueOptions = {}): Promise<void> {
    if (opts.jobId) {
      if (this.seenIds.has(opts.jobId)) return;
      this.seenIds.add(opts.jobId);
    }
    this.jobs.push({ queue, name, data, opts, attemptsMade: 0 });
  }

  process<T>(queue: QueueName, handler: JobHandler<T>): void {
    this.handlers.set(queue, handler as JobHandler);
  }

  /**
   * Exécute les tâches d'une file, y compris celles qu'elles ajoutent et leurs
   * nouvelles tentatives, jusqu'à épuisement (`maxRounds` passes au plus).
   */
  async drain(queue: QueueName, maxRounds = 20): Promise<number> {
    const handler = this.handlers.get(queue);
    if (!handler) throw new Error(`Aucun traitement enregistré pour ${queue}`);
    let executed = 0;
    for (let round = 0; round < maxRounds; round++) {
      const pending = this.jobs.filter((j) => j.queue === queue);
      if (pending.length === 0) break;
      this.jobs.splice(0, this.jobs.length, ...this.jobs.filter((j) => j.queue !== queue));
      for (const job of pending) {
        executed++;
        try {
          await handler(job.data, { id: job.opts.jobId ?? '', attemptsMade: job.attemptsMade });
        } catch (error) {
          const next = { ...job, attemptsMade: job.attemptsMade + 1 };
          if (next.attemptsMade < (job.opts.attempts ?? DEFAULT_ATTEMPTS)) this.jobs.push(next);
          else this.failed.push({ ...next, error });
        }
      }
    }
    return executed;
  }

  /** Exécute une seule passe (sans les tâches ajoutées pendant celle-ci). */
  async drainOnce(queue: QueueName): Promise<number> {
    return this.drain(queue, 1);
  }

  async close(): Promise<void> {}
}
