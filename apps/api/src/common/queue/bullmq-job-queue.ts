import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { runWithRequestId } from '../logging/request-context';
import { DEFAULT_ATTEMPTS, DEFAULT_BACKOFF_MS, EnqueueOptions, JobHandler, JobQueue, QueueCounts, QueueName, QUEUES } from './job-queue';

/** Options de connexion BullMQ dérivées de REDIS_URL (redis:// ou rediss://). */
export function connectionFromUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    // Requis par BullMQ pour les workers (commandes bloquantes).
    maxRetriesPerRequest: null,
  };
}

export class BullMqJobQueue extends JobQueue {
  private readonly logger = new Logger('JobQueue');
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];

  constructor(
    private readonly connection: ConnectionOptions,
    private readonly onJobDone?: (queue: QueueName, status: 'completed' | 'failed', seconds: number) => void,
  ) {
    super();
  }

  private queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.connection,
        defaultJobOptions: {
          attempts: DEFAULT_ATTEMPTS,
          backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_MS },
          removeOnComplete: { age: 24 * 3600, count: 10_000 },
          // Les tâches en échec définitif restent consultables : c'est la file des échecs.
          removeOnFail: { age: 30 * 24 * 3600 },
        },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue<T>(queue: QueueName, name: string, data: T, opts: EnqueueOptions = {}): Promise<void> {
    await this.queue(queue).add(name, data, {
      delay: opts.delayMs,
      jobId: opts.jobId,
      ...(opts.attempts ? { attempts: opts.attempts } : {}),
    });
  }

  process<T>(queue: QueueName, handler: JobHandler<T>, opts: { concurrency?: number } = {}): void {
    const worker = new Worker(
      queue,
      async (job) => {
        const started = process.hrtime.bigint();
        try {
          // L'id de la tâche sert d'identifiant de corrélation dans les journaux.
          await runWithRequestId(`job-${job.id ?? ''}`, () =>
            handler(job.data as T, { id: job.id ?? '', attemptsMade: job.attemptsMade }),
          );
          this.onJobDone?.(queue, 'completed', Number(process.hrtime.bigint() - started) / 1e9);
        } catch (err) {
          this.onJobDone?.(queue, 'failed', Number(process.hrtime.bigint() - started) / 1e9);
          throw err;
        }
      },
      { connection: this.connection, concurrency: opts.concurrency ?? 5 },
    );
    worker.on('failed', (job, err) => {
      const final = job && job.attemptsMade >= (job.opts.attempts ?? 1);
      this.logger.warn(`Tâche ${queue}/${job?.name} ${job?.id} en échec${final ? ' définitif' : ''} : ${err?.message}`);
    });
    this.workers.push(worker);
  }

  async counts(): Promise<QueueCounts[]> {
    return Promise.all(
      Object.values(QUEUES).map(async (queue) => {
        const c = await this.queue(queue).getJobCounts('waiting', 'active', 'delayed', 'failed');
        return { queue, waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 };
      }),
    );
  }

  async retryFailed(queue: QueueName): Promise<number> {
    const failed = await this.queue(queue).getJobs(['failed'], 0, 999);
    await Promise.all(failed.map((job) => job.retry('failed')));
    return failed.length;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
