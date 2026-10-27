import { errorFromHttpStatus, ProviderError } from '../core/errors';
import { createFetchHttpClient, HttpClient, withRetry } from '../core/http';
import { assertE164, toMsisdn } from '../core/validation';
import type { IncomingRequest, ProviderDeps } from '../mobile-money/types';
import type { DeliveryEvent, DeliveryStatus, InboundMessage, SendResult, SmsProvider } from './types';

const PROVIDER = 'infobip';

export interface InfobipConfig {
  /** URL de base propre au compte Infobip (ex. https://xxxxx.api.infobip.com). */
  baseUrl: string;
  apiKey: string;
  /** Nom d'expéditeur (« AlphaPay » si autorisé, sinon numéro générique). */
  senderId: string;
  /** URL AlphaPay recevant les accusés de livraison. */
  notifyUrl?: string;
}

/** Groupe de statut Infobip → statut de livraison unifié. */
function mapGroup(group: unknown): DeliveryStatus {
  switch (group) {
    case 'DELIVERED':
      return 'delivered';
    case 'UNDELIVERABLE':
    case 'EXPIRED':
    case 'REJECTED':
      return 'failed';
    default:
      return 'sent';
  }
}

/** Prix Infobip (décimal, devise du compte) → unités mineures. */
function priceToMinor(price: { pricePerMessage?: unknown; currency?: unknown } | undefined) {
  const p = Number(price?.pricePerMessage);
  const currency = typeof price?.currency === 'string' ? price.currency : undefined;
  if (!currency || !Number.isFinite(p)) return undefined;
  const decimals = currency === 'XAF' ? 0 : 2;
  return { amount: Math.round(p * 10 ** decimals), currency };
}

/**
 * SMS via Infobip (D-009), API « SMS v2 advanced ».
 * À valider sur un compte réel (format exact des accusés et des messages entrants).
 */
export class InfobipSmsProvider implements SmsProvider {
  readonly name = PROVIDER;
  private readonly http: HttpClient;

  constructor(
    private readonly config: InfobipConfig,
    private readonly deps: ProviderDeps = {},
  ) {
    for (const key of ['baseUrl', 'apiKey', 'senderId'] as const) {
      if (!config[key]) throw new ProviderError('not_configured', `Infobip : ${key} manquant`, { provider: PROVIDER });
    }
    this.http = deps.http ?? createFetchHttpClient(PROVIDER);
  }

  async send(input: { to: string; text: string; senderId?: string }): Promise<SendResult> {
    assertE164(PROVIDER, input.to, 'to');
    const res = await withRetry(
      async () => {
        const r = await this.http.request({
          method: 'POST',
          url: `${this.config.baseUrl.replace(/\/$/, '')}/sms/2/text/advanced`,
          headers: { Authorization: `App ${this.config.apiKey}`, Accept: 'application/json' },
          body: {
            messages: [
              {
                destinations: [{ to: toMsisdn(input.to) }],
                from: input.senderId ?? this.config.senderId,
                text: input.text,
                ...(this.config.notifyUrl ? { notifyUrl: this.config.notifyUrl, notifyContentType: 'application/json' } : {}),
              },
            ],
          },
        });
        if (r.status !== 200) throw errorFromHttpStatus(PROVIDER, r.status, 'Envoi SMS Infobip');
        return r;
      },
      { sleep: this.deps.sleep },
    );
    const message = res.data?.messages?.[0];
    if (!message?.messageId) throw new ProviderError('unknown', 'Réponse Infobip sans messageId', { provider: PROVIDER });
    if (message.status?.groupName === 'REJECTED') {
      throw new ProviderError('rejected', `SMS refusé par Infobip (${message.status?.name ?? 'REJECTED'})`, {
        provider: PROVIDER,
        retryable: false,
      });
    }
    return { providerMessageId: message.messageId };
  }

  parseDeliveryReport(req: IncomingRequest): DeliveryEvent[] {
    const results = (req.body as { results?: unknown[] } | undefined)?.results;
    if (!Array.isArray(results)) return [];
    return results.flatMap((r: any) => {
      if (typeof r?.messageId !== 'string') return [];
      const status = mapGroup(r.status?.groupName);
      const cost = priceToMinor(r.price);
      return [
        {
          providerMessageId: r.messageId,
          status,
          ...(status === 'failed' ? { failureReason: String(r.error?.name ?? r.status?.name ?? 'UNDELIVERABLE') } : {}),
          ...(cost ? { cost } : {}),
        },
      ];
    });
  }

  parseInbound(req: IncomingRequest): InboundMessage[] {
    const results = (req.body as { results?: unknown[] } | undefined)?.results;
    if (!Array.isArray(results)) return [];
    return results.flatMap((r: any) =>
      typeof r?.from === 'string' && typeof (r.cleanText ?? r.text) === 'string'
        ? [{ from: r.from.startsWith('+') ? r.from : `+${r.from}`, text: String(r.cleanText ?? r.text) }]
        : [],
    );
  }
}
