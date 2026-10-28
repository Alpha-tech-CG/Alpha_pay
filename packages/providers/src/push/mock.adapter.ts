import { ProviderError } from '../core/errors';
import type { PushPayload, PushSubscriptionKeys, WebPushProvider } from './types';

/** Web push factice : les tests lisent `sent`; les points de terminaison de `expired` répondent 410. */
export class MockWebPushProvider implements WebPushProvider {
  readonly name = 'mock-web-push';
  readonly publicKey = 'BMockPublicKeyForDevelopmentOnly-not-a-real-vapid-key';
  readonly sent: { endpoint: string; payload: PushPayload; at: number }[] = [];
  readonly expired = new Set<string>();

  async send(subscription: PushSubscriptionKeys, payload: PushPayload): Promise<void> {
    if (this.expired.has(subscription.endpoint)) {
      throw new ProviderError('not_found', 'Abonnement push expiré (simulation)', { provider: this.name, httpStatus: 410, retryable: false });
    }
    this.sent.push({ endpoint: subscription.endpoint, payload, at: Date.now() });
  }
}
