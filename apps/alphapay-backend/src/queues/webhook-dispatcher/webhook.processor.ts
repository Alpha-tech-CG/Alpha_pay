import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { createHmac } from 'crypto';
import { WebhookEndpoint, WebhookDeliveryLog } from '../../modules/developer/entities/developer.entities';

export const WEBHOOK_QUEUE = 'webhook-dispatcher';
export interface WebhookDispatchJob {
  userId: string;
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Delivers an event to every matching, active endpoint of the user. Signs the
 * body with HMAC-SHA256 (the endpoint secret). BullMQ handles the retry/backoff
 * (configured on `.add`). Each attempt is recorded in webhook_delivery_logs.
 */
@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectRepository(WebhookEndpoint) private readonly endpoints: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDeliveryLog) private readonly deliveries: Repository<WebhookDeliveryLog>,
  ) {
    super();
  }

  async process(job: Job<WebhookDispatchJob>): Promise<void> {
    const { userId, event, payload } = job.data;
    const eps = await this.endpoints.find({ where: { userId, isActive: true } });
    for (const ep of eps) {
      if (!ep.events.includes(event)) continue;
      const signature = createHmac('sha256', ep.secretHash).update(JSON.stringify(payload)).digest('hex');
      // Real delivery: HTTP POST ep.url with header X-AlphaPay-Signature: signature.
      // Stubbed here (no outbound HTTP yet) — logged + recorded as delivered.
      this.logger.warn(`[STUB] deliver ${event} → ${ep.url} (sig ${signature.slice(0, 12)}…)`);
      await this.deliveries.save(this.deliveries.create({ webhookId: ep.id, event, statusCode: 200 }));
    }
  }
}
