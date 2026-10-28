import webpush from 'web-push';
import { ProviderError } from '../core/errors';
import type { PushPayload, PushSubscriptionKeys, WebPushProvider } from './types';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** `mailto:` ou URL de contact exigée par les services push. */
  subject: string;
}

/** Envoi web push standard (RFC 8030/8291, VAPID) via la bibliothèque `web-push`. */
export class VapidWebPushProvider implements WebPushProvider {
  readonly name = 'web-push';
  readonly publicKey: string;

  constructor(
    private readonly config: VapidConfig,
    private readonly client: Pick<typeof webpush, 'sendNotification'> = webpush,
  ) {
    this.publicKey = config.publicKey;
  }

  async send(subscription: PushSubscriptionKeys, payload: PushPayload, opts: { ttlSeconds?: number } = {}): Promise<void> {
    try {
      await this.client.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        {
          TTL: opts.ttlSeconds ?? 300,
          urgency: 'high',
          vapidDetails: { subject: this.config.subject, publicKey: this.config.publicKey, privateKey: this.config.privateKey },
        },
      );
    } catch (err: any) {
      const status: number | undefined = err?.statusCode;
      if (status === 404 || status === 410) {
        throw new ProviderError('not_found', 'Abonnement push expiré', { provider: this.name, httpStatus: status, retryable: false });
      }
      if (status === 429) throw new ProviderError('rate_limited', 'Service push saturé', { provider: this.name, httpStatus: status });
      if (status && status >= 500) throw new ProviderError('unavailable', `Service push indisponible (HTTP ${status})`, { provider: this.name, httpStatus: status });
      if (status) throw new ProviderError('rejected', `Notification refusée (HTTP ${status})`, { provider: this.name, httpStatus: status, retryable: false });
      throw new ProviderError('network', 'Service push injoignable', { provider: this.name });
    }
  }

  /** Génère une paire de clés VAPID (à placer dans VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). */
  static generateKeys(): { publicKey: string; privateKey: string } {
    return webpush.generateVAPIDKeys();
  }
}
