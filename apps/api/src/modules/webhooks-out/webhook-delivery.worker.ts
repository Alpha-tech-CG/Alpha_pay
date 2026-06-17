import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@paybrain/database';
import { WebhookDeliveryService } from './webhook-delivery.service';

/**
 * Worker de livraison des webhooks sortants (ALP-132).
 *
 * Implémenté en cron DB-polling (pas BullMQ) car Redis/Docker n'est pas
 * disponible dans cet environnement ; sémantique identique (retry programmé via
 * nextRetryAt). La logique de livraison étant isolée dans WebhookDeliveryService,
 * un passage à BullMQ ne toucherait que ce fichier.
 */
@Injectable()
export class WebhookDeliveryWorker {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly delivery: WebhookDeliveryService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPending() {
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', nextRetryAt: { lte: new Date() } },
      take: 20,
      orderBy: { nextRetryAt: 'asc' },
    });

    for (const d of due) {
      await this.delivery.attempt(d).catch((err) =>
        this.logger.error(`Échec inattendu livraison ${d.id}: ${err?.message}`),
      );
    }
  }
}
