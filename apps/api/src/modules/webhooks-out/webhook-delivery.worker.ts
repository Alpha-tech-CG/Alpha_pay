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
// Fenêtre de réservation d'une livraison par une instance (> HTTP_TIMEOUT_MS de
// WebhookDeliveryService, 10s) : si le pod crashe pendant l'envoi, la ligne
// redevient livrable après ce délai.
const CLAIM_LOCK_MS = 60_000;

@Injectable()
export class WebhookDeliveryWorker {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly delivery: WebhookDeliveryService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPending() {
    const now = Date.now();
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', nextRetryAt: { lte: new Date(now) } },
      take: 20,
      orderBy: { nextRetryAt: 'asc' },
    });

    for (const d of due) {
      // Claim atomique multi-instance : chaque pod exécute ce cron et lit le même
      // lot. WebhookDeliveryStatus n'a pas d'état PROCESSING → on réserve la ligne
      // via un « visibility timeout » : on repousse nextRetryAt dans le futur en
      // exigeant qu'il soit encore <= now. Une seule instance obtient count=1 et
      // livre ; les autres voient nextRetryAt futur et passent. `attempt()`
      // réécrit ensuite status/nextRetryAt (succès, retry programmé ou échec). En
      // cas de crash pendant la livraison, la ligne redevient visible après le
      // verrou. Sans ce garde, N pods envoient N POST pour la même livraison.
      const claim = await this.prisma.webhookDelivery.updateMany({
        where: { id: d.id, status: 'PENDING', nextRetryAt: { lte: new Date(now) } },
        data: { nextRetryAt: new Date(now + CLAIM_LOCK_MS) },
      });
      if (claim.count === 0) continue; // déjà réservée par une autre instance

      await this.delivery.attempt(d).catch((err) =>
        this.logger.error(`Échec inattendu livraison ${d.id}: ${err?.message}`),
      );
    }
  }
}
