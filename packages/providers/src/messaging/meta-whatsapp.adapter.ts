import { errorFromHttpStatus, ProviderError } from '../core/errors';
import { createFetchHttpClient, HttpClient, withRetry } from '../core/http';
import { assertE164, headerValue, hmacSha256Hex, safeEqual, toMsisdn } from '../core/validation';
import type { IncomingRequest, ProviderDeps } from '../mobile-money/types';
import type { DeliveryEvent, DeliveryStatus, InboundMessage, SendResult, WhatsAppProvider } from './types';

const PROVIDER = 'meta-whatsapp';

export interface MetaWhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  /** Secret de l'application Meta : signe les webhooks (X-Hub-Signature-256). */
  appSecret: string;
  apiVersion?: string;
  baseUrl?: string;
}

// Erreurs Meta définitives côté destinataire : inutile de réessayer, basculer.
// 131026 message non livrable, 131047 fenêtre de 24 h dépassée, 132000/132001 modèle invalide.
const DEFINITIVE_ERRORS = new Set([131026, 131047, 132000, 132001, 131051, 470]);

const STATUS: Record<string, DeliveryStatus> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };

/** WhatsApp Cloud API de Meta en direct (§M9). */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = PROVIDER;
  private readonly http: HttpClient;

  constructor(
    private readonly config: MetaWhatsAppConfig,
    private readonly deps: ProviderDeps = {},
  ) {
    for (const key of ['phoneNumberId', 'accessToken', 'appSecret'] as const) {
      if (!config[key]) throw new ProviderError('not_configured', `WhatsApp : ${key} manquant`, { provider: PROVIDER });
    }
    this.http = deps.http ?? createFetchHttpClient(PROVIDER);
  }

  async sendTemplate(input: {
    to: string;
    template: string;
    language: string;
    variables: string[];
    authenticationCode?: string;
  }): Promise<SendResult> {
    assertE164(PROVIDER, input.to, 'to');
    const components: unknown[] = [];
    if (input.variables.length > 0) {
      components.push({ type: 'body', parameters: input.variables.map((text) => ({ type: 'text', text })) });
    }
    if (input.authenticationCode) {
      // Modèle « Authentification » : le bouton copie le code.
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: input.authenticationCode }],
      });
    }
    const base = (this.config.baseUrl ?? 'https://graph.facebook.com').replace(/\/$/, '');
    const res = await withRetry(
      async () => {
        const r = await this.http.request({
          method: 'POST',
          url: `${base}/${this.config.apiVersion ?? 'v21.0'}/${this.config.phoneNumberId}/messages`,
          headers: { Authorization: `Bearer ${this.config.accessToken}` },
          body: {
            messaging_product: 'whatsapp',
            to: toMsisdn(input.to),
            type: 'template',
            template: { name: input.template, language: { code: input.language }, ...(components.length ? { components } : {}) },
          },
        });
        if (r.status === 200) return r;
        const code = Number(r.data?.error?.code);
        if (DEFINITIVE_ERRORS.has(code)) {
          throw new ProviderError('rejected', `WhatsApp : message refusé (code ${code})`, {
            provider: PROVIDER,
            retryable: false,
            httpStatus: r.status,
          });
        }
        throw errorFromHttpStatus(PROVIDER, r.status, 'Envoi WhatsApp');
      },
      { sleep: this.deps.sleep },
    );
    const id = res.data?.messages?.[0]?.id;
    if (typeof id !== 'string') throw new ProviderError('unknown', 'Réponse WhatsApp sans identifiant', { provider: PROVIDER });
    return { providerMessageId: id };
  }

  private verify(req: IncomingRequest): any {
    const signature = headerValue(req.headers, 'x-hub-signature-256');
    const expected = req.rawBody ? `sha256=${hmacSha256Hex(this.config.appSecret, req.rawBody)}` : '';
    if (!signature || !req.rawBody || !safeEqual(signature, expected)) {
      throw new ProviderError('invalid_signature', 'Signature du webhook WhatsApp invalide', { provider: PROVIDER });
    }
    return JSON.parse(req.rawBody);
  }

  private values(body: any): any[] {
    return (Array.isArray(body?.entry) ? body.entry : []).flatMap((e: any) =>
      (Array.isArray(e?.changes) ? e.changes : []).map((c: any) => c?.value ?? {}),
    );
  }

  parseStatusWebhook(req: IncomingRequest): DeliveryEvent[] {
    return this.values(this.verify(req)).flatMap((v: any) =>
      (Array.isArray(v.statuses) ? v.statuses : []).flatMap((s: any) => {
        const status = STATUS[s?.status];
        if (typeof s?.id !== 'string' || !status) return [];
        const err = Array.isArray(s.errors) ? s.errors[0] : undefined;
        return [{ providerMessageId: s.id, status, ...(status === 'failed' ? { failureReason: String(err?.code ?? 'failed') } : {}) }];
      }),
    );
  }

  parseInbound(req: IncomingRequest): InboundMessage[] {
    return this.values(this.verify(req)).flatMap((v: any) =>
      (Array.isArray(v.messages) ? v.messages : []).flatMap((m: any) =>
        typeof m?.from === 'string' && typeof m?.text?.body === 'string' ? [{ from: `+${m.from}`, text: m.text.body }] : [],
      ),
    );
  }
}
