import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@paybrain/database';
import { signWebhookPayload } from '../../common/security/hmac';
import { decryptField } from '../../common/security/pii-crypto';
import { NotificationService } from '../notifications/notification.service';

// Retry exponentiel exigé par ALP-132 (secondes) : délai APRÈS chaque échec.
const RETRY_SCHEDULE_SEC = [30, 120, 600, 3600, 21600, 86400]; // 30s, 2m, 10m, 1h, 6h, 24h
const HTTP_TIMEOUT_MS = 10_000;

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Crée une livraison PENDING par endpoint actif du marchand abonné à l'event.
   * Le worker cron la prendra en charge.
   */
  async dispatch(merchantId: string, event: string, payload: Record<string, unknown>): Promise<number> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { merchantId, status: 'ACTIVE', events: { has: event } },
    });

    for (const endpoint of endpoints) {
      await this.prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          event,
          webhookId: randomUUID(),
          payload: payload as any,
        },
      });
    }
    return endpoints.length;
  }

  /** Envoie immédiatement une livraison de test (1 essai, hors cycle de retry). */
  async sendTest(endpoint: { id: string; url: string; secret: string }) {
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        event: 'webhook.test',
        webhookId: randomUUID(),
        payload: { type: 'webhook.test', message: 'Ceci est un test PayBrain', at: new Date().toISOString() } as any,
      },
    });
    return this.attempt(delivery);
  }

  /** Traite une livraison : POST signé, met à jour statut/attempts/nextRetryAt. */
  async attempt(delivery: {
    id: string; endpointId: string; webhookId: string; event: string; payload: unknown; attempts: number;
  }) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } });
    if (!endpoint) {
      await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', lastError: 'endpoint supprimé' } });
      return { ok: false, status: 0 };
    }

    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(delivery.payload);
    const signature = signWebhookPayload(endpoint.secret, ts, body);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature-256': signature,
          'X-Timestamp': String(ts),
          'X-Webhook-Id': delivery.webhookId,
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
      await this.scheduleRetryOrFail(delivery, `HTTP ${res.status}`, res.status, text);
      return { ok: false, status: res.status };
    } catch (err: any) {
      await this.scheduleRetryOrFail(delivery, err?.name === 'AbortError' ? 'timeout' : (err?.message ?? 'erreur réseau'), null, null);
      return { ok: false, status: 0 };
    } finally {
      clearTimeout(timer);
    }
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
