import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Histogram } from 'prom-client';
import { MetricsModule } from '../../modules/metrics/metrics.module';
import { MetricsService } from '../../modules/metrics/metrics.service';
import { BullMqJobQueue, connectionFromUrl } from './bullmq-job-queue';
import { InMemoryJobQueue } from './in-memory-job-queue';
import { JobQueue } from './job-queue';

function createJobQueue(metrics: MetricsService): JobQueue {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') throw new Error('REDIS_URL requis : la file de tâches est adossée à Redis');
    return new InMemoryJobQueue();
  }
  const duration = new Histogram({
    name: 'alphapay_job_duration_seconds',
    help: 'Durée des tâches de la file, par file et résultat',
    labelNames: ['queue', 'status'],
    buckets: [0.05, 0.1, 0.5, 1, 2, 5, 15, 60],
    registers: [metrics.registry],
  });
  return new BullMqJobQueue(connectionFromUrl(url), (queue, status, seconds) =>
    duration.observe({ queue, status }, seconds),
  );
}

@Global()
@Module({
  imports: [MetricsModule],
  providers: [{ provide: JobQueue, useFactory: createJobQueue, inject: [MetricsService] }],
  exports: [JobQueue],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(JobQueue) private readonly queue: JobQueue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
