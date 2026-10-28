import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@paybrain/database';
import { alphaPaySignature } from '../../common/security/hmac';
import { decryptField } from '../../common/security/pii-crypto';
import { NotificationService } from '../notifications/notification.service';

// Nouvelles tentatives sur 24 h (§M10) : délai APRÈS chaque échec.
// 1 min, 5 min, 30 min, 2 h, 6 h, 15 h → dernière tentative ≈ 23 h 36 après la première.
export const RETRY_SCHEDULE_SEC = [60, 300, 1800, 7200, 21600, 54000];
const HTTP_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Crée une livraison PENDING par endpoint actif du marchand abonné à l'événement
   * (liste vide = tous les événements). Le worker cron la prendra en charge.
   * Enveloppe commune (§7) : même `id` d'événement pour tous les endpoints, ce
   * qui permet au marchand de dédoublonner (renvoi manuel compris).
   */
  async dispatch(merchantId: string, livemode: boolean, event: string, object: Record<string, unknown>): Promise<number> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { merchantId, livemode, status: 'ACTIVE', OR: [{ events: { has: event } }, { events: { isEmpty: true } }] },
    });
    const envelope = { id: `evt_${randomUUID().replace(/-/g, '')}`, object: 'event', type: event, livemode, created_at: new Date().toISOString(), data: { object } };

    for (const endpoint of endpoints) {
      await this.prisma.webhookDelivery.create({
        data: { endpointId: endpoint.id, event, webhookId: randomUUID(), payload: envelope as any },
      });
    }
    return endpoints.length;
  }

  /** Renvoi manuel (bouton « renvoyer ») : même événement, tentative immédiate hors barème. */
  async resend(delivery: { id: string; endpointId: string; webhookId: string; event: string; payload: unknown; attempts: number }) {
    return this.attempt(delivery, { manual: true });
  }

  /** Envoie immédiatement une livraison de test (1 essai, hors cycle de retry). */
  async sendTest(endpoint: { id: string; url: string; secret: string }) {
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        event: 'webhook.test',
        webhookId: randomUUID(),
        payload: {
          id: `evt_${randomUUID().replace(/-/g, '')}`,
          object: 'event',
          type: 'webhook.test',
          created_at: new Date().toISOString(),
          data: { object: { message: 'Ceci est un test AlphaPay' } },
        } as any,
      },
    });
    return this.attempt(delivery, { manual: true });
  }

  /** Traite une livraison : POST signé, met à jour statut/attempts/nextRetryAt. */
  async attempt(
    delivery: { id: string; endpointId: string; webhookId: string; event: string; payload: unknown; attempts: number },
    opts: { manual?: boolean } = {},
  ) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } });
    if (!endpoint) {
      await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', lastError: 'endpoint supprimé' } });
      return { ok: false, status: 0 };
    }

    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(delivery.payload);
    const signature = alphaPaySignature(endpoint.secret, ts, body);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AlphaPay-Webhooks/1.0',
          // « t=<horodatage>,v1=<HMAC-SHA256(secret, "<t>.<corps>")> » (§M10).
          'AlphaPay-Signature': signature,
          'AlphaPay-Event': delivery.event,
          'AlphaPay-Delivery-Id': delivery.webhookId,
        },
        body,
        signal: controller.signal,
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SUCCESS', attempts: delivery.attempts + 1, responseStatus: res.status, responseBody: text.slice(0, 500), lastError: null },
        });
        return { ok: true, status: res.status };
      }
      await this.recordFailure(delivery, `HTTP ${res.status}`, res.status, text, opts.manual);
      return { ok: false, status: res.status };
    } catch (err: any) {
      await this.recordFailure(delivery, err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'erreur réseau'), null, null, opts.manual);
      return { ok: false, status: 0 };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Un renvoi manuel en échec est journalisé sans toucher au barème des nouvelles tentatives. */
  private async recordFailure(
    delivery: { id: string; attempts: number; endpointId: string },
    reason: string,
    responseStatus: number | null,
    responseBody: string | null,
    manual?: boolean,
  ) {
    if (!manual) return this.scheduleRetryOrFail(delivery, reason, responseStatus, responseBody);
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { attempts: delivery.attempts + 1, lastError: reason, responseStatus: responseStatus ?? undefined, responseBody: responseBody?.slice(0, 500) },
    });
  }

  private async scheduleRetryOrFail(
    delivery: { id: string; attempts: number; endpointId: string },
    reason: string,
    responseStatus: number | null,
    responseBody: string | null,
  ) {
    const attempts = delivery.attempts + 1;
    // Délai après ce énième échec ; au-delà du barème → échec définitif.
    const delaySec = RETRY_SCHEDULE_SEC[attempts - 1];
    if (delaySec === undefined) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', attempts, lastError: reason, responseStatus: responseStatus ?? undefined, responseBody: responseBody?.slice(0, 500) },
      });
      await this.alertMerchant(delivery.endpointId, reason);
      return;
    }
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'PENDING', attempts, lastError: reason,
        responseStatus: responseStatus ?? undefined, responseBody: responseBody?.slice(0, 500),
        nextRetryAt: new Date(Date.now() + delaySec * 1000),
      },
    });
  }

  /** Alerte le marchand par email après échec définitif (ALP-143). */
  private async alertMerchant(endpointId: string, reason: string) {
    this.logger.error(`Webhook endpoint ${endpointId} en échec définitif (${reason})`);
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
      include: { merchant: { select: { id: true, emailEncrypted: true } } },
    });
    if (!endpoint?.merchant?.emailEncrypted) return;
    await this.notifications.send({
      channel: 'EMAIL',
      to: decryptField(endpoint.merchant.emailEncrypted),
      template: 'webhook.failed',
      category: 'webhook_failure',
      merchantId: endpoint.merchant.id,
      data: { url: endpoint.url, attempts: RETRY_SCHEDULE_SEC.length + 1, reason },
    });
  }
}
