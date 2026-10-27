import { randomUUID } from 'crypto';
import { ProviderError } from '../core/errors';
import { assertE164 } from '../core/validation';
import type { IncomingRequest } from '../mobile-money/types';
import type { DeliveryEvent, DeliveryStatus, EmailProvider, InboundMessage, MessageChannel, SendResult, SmsProvider, WhatsAppProvider } from './types';

export interface MockSentMessage {
  channel: MessageChannel;
  providerMessageId: string;
  to: string;
  /** Texte rendu, ou nom du modèle WhatsApp. Uniquement en mémoire, jamais journalisé. */
  content: string;
  variables?: string[];
  subject?: string;
}

/**
 * Boîte d'envoi partagée par les fournisseurs de messages factices : les
 * tests y lisent ce qui « serait parti ». Les destinations listées dans
 * `failing` échouent (erreur définitive) pour tester la bascule de canal.
 */
export class MockOutbox {
  readonly sent: MockSentMessage[] = [];
  readonly failing = new Set<string>();
  /** Si vrai, chaque envoi lève une erreur réessayable (panne fournisseur). */
  unavailable = false;
  /** Rappel facultatif à chaque envoi (ex. boîte d'envoi de développement). */
  onRecord?: (message: MockSentMessage) => void;

  record(message: Omit<MockSentMessage, 'providerMessageId'>, provider: string): SendResult {
    if (this.unavailable) throw new ProviderError('unavailable', 'Fournisseur factice indisponible', { provider });
    if (this.failing.has(message.to)) {
      throw new ProviderError('rejected', 'Destination non joignable (simulation)', { provider, retryable: false });
    }
    const providerMessageId = `${provider}_${randomUUID()}`;
    const recorded = { ...message, providerMessageId };
    this.sent.push(recorded);
    this.onRecord?.(recorded);
    return { providerMessageId, cost: { amount: 0, currency: 'XAF' } };
  }

  last(channel?: MessageChannel): MockSentMessage | undefined {
    const list = channel ? this.sent.filter((m) => m.channel === channel) : this.sent;
    return list[list.length - 1];
  }

  clear(): void {
    this.sent.length = 0;
    this.failing.clear();
    this.unavailable = false;
  }
}

/** Accusé de livraison factice : `{ providerMessageId, status, failureReason? }` ou un tableau de ceux-ci. */
function parseMockReports(req: IncomingRequest): DeliveryEvent[] {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const statuses: DeliveryStatus[] = ['sent', 'delivered', 'read', 'failed'];
  return items.flatMap((item) => {
    const i = item as Partial<DeliveryEvent> | undefined;
    if (!i || typeof i.providerMessageId !== 'string' || !statuses.includes(i.status as DeliveryStatus)) return [];
    return [{ providerMessageId: i.providerMessageId, status: i.status!, ...(i.failureReason ? { failureReason: i.failureReason } : {}) }];
  });
}

export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock-sms';
  constructor(readonly outbox = new MockOutbox()) {}

  async send(input: { to: string; text: string }): Promise<SendResult> {
    assertE164(this.name, input.to, 'to');
    return this.outbox.record({ channel: 'sms', to: input.to, content: input.text }, this.name);
  }

  parseDeliveryReport(req: IncomingRequest): DeliveryEvent[] {
    return parseMockReports(req);
  }

  /** Message entrant factice : `{ from, text }`. */
  parseInbound(req: IncomingRequest): InboundMessage[] {
    const b = req.body as { from?: unknown; text?: unknown } | undefined;
    return typeof b?.from === 'string' && typeof b?.text === 'string' ? [{ from: b.from, text: b.text }] : [];
  }
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'mock-whatsapp';
  constructor(readonly outbox = new MockOutbox()) {}

  async sendTemplate(input: { to: string; template: string; language: string; variables: string[] }): Promise<SendResult> {
    assertE164(this.name, input.to, 'to');
    return this.outbox.record(
      { channel: 'whatsapp', to: input.to, content: input.template, variables: input.variables },
      this.name,
    );
  }

  parseStatusWebhook(req: IncomingRequest): DeliveryEvent[] {
    return parseMockReports(req);
  }
}

export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock-email';
  constructor(readonly outbox = new MockOutbox()) {}

  async send(input: { to: string; subject: string; text: string }): Promise<SendResult> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
      throw new ProviderError('invalid_request', 'Adresse email invalide', { provider: this.name });
    }
    return this.outbox.record({ channel: 'email', to: input.to, content: input.text, subject: input.subject }, this.name);
  }
}
