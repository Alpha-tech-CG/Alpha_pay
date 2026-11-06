import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@paybrain/database';
import { alphaPaySignature } from '../../common/security/hmac';
import { decryptField } from '../../common/security/pii-crypto';
import { postWebhook, WebhookUrlRejectedError } from '../../common/security/webhook-url-guard';
import type { MessagingService } from '../messaging/messaging.service';

// Nouvelles tentatives sur 24 h (§M10) : délai APRÈS chaque échec.
// 1 min, 5 min, 30 min, 2 h, 6 h, 15 h → dernière tentative ≈ 23 h 36 après la première.
export const RETRY_SCHEDULE_SEC = [60, 300, 1800, 7200, 21600, 54000];
const HTTP_TIMEOUT_MS = 10_000;

/**
 * Motif d'échec visible du marchand : générique, sans détail réseau (adresse,
 * port, message système) qui l'aiderait à cartographier une infrastructure.
 */
function deliveryErrorReason(err: any): string {
  if (err instanceof WebhookUrlRejectedError) return `destination refusée : ${err.message}`;
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return 'timeout';
  // Code système seul (ECONNREFUSED, CERT_HAS_EXPIRED…), jamais le message.
  return typeof err?.code === 'string' && /^[A-Z0-9_]+$/.test(err.code) ? `erreur réseau (${err.code})` : 'erreur réseau';
}

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly moduleRef: ModuleRef,
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

    try {
      // Connexion épinglée sur une adresse publique validée, sans suivre de
      // redirection (anti-SSRF, cf. webhook-url-guard).
      const res = await postWebhook(endpoint.url, {
        livemode: endpoint.livemode,
        timeoutMs: HTTP_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AlphaPay-Webhooks/1.0',
          // « t=<horodatage>,v1=<HMAC-SHA256(secret, "<t>.<corps>")> » (§M10).
          'AlphaPay-Signature': signature,
          'AlphaPay-Event': delivery.event,
          'AlphaPay-Delivery-Id': delivery.webhookId,
        },
        body,
      });
      if (res.status >= 200 && res.status < 300) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SUCCESS', attempts: delivery.attempts + 1, responseStatus: res.status, responseBody: res.body.slice(0, 500), lastError: null },
        });
        return { ok: true, status: res.status };
      }
      // Une redirection est un échec : elle n'est jamais suivie.
      const reason = res.status >= 300 && res.status < 400 ? `redirection refusée (HTTP ${res.status})` : `HTTP ${res.status}`;
      await this.recordFailure(delivery, reason, res.status, res.body, opts.manual);
      return { ok: false, status: res.status };
    } catch (err: any) {
      await this.recordFailure(delivery, deliveryErrorReason(err), null, null, opts.manual);
      return { ok: false, status: 0 };
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
    // Résolu à l'appel, sans import au chargement : messaging.service importe déjà
    // ce fichier, un cycle d'imports y rendrait WebhookDeliveryService indéfini.
    const { MessagingService: token } = await import('../messaging/messaging.service');
    const messaging: MessagingService = this.moduleRef.get(token, { strict: false });
    await messaging
      .send({
        merchantId: null,
        livemode: true,
        channels: ['EMAIL'],
        to: { email: decryptField(endpoint.merchant.emailEncrypted) },
        templateKey: 'message.libre',
        variables: {
          subject: 'AlphaPay - webhook en échec',
          text: `Votre endpoint webhook ${endpoint.url} est en échec après ${RETRY_SCHEDULE_SEC.length + 1} tentatives (${reason}). Les événements restent consultables et peuvent être renvoyés depuis l'espace Développeurs.`,
        },
        category: 'TRANSACTIONAL',
      })
      .catch((err) => this.logger.warn(`Alerte webhook non envoyée : ${(err as Error).message}`));
  }
}
