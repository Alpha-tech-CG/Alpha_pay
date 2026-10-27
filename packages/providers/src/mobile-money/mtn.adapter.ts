import { errorFromHttpStatus, ProviderError } from '../core/errors';
import { createFetchHttpClient, HttpClient, withRetry } from '../core/http';
import { MemoryTokenCache, TokenCache, tokenTtlSeconds } from '../core/token-cache';
import { assertAmount, assertE164, deterministicUuid, toMajorString, toMsisdn } from '../core/validation';
import { resolveCredentials } from './credentials';
import type {
  AccountHolderResult,
  CallbackResult,
  IncomingRequest,
  MobileMoneyConnection,
  MobileMoneyProvider,
  MobileMoneyProviderFactory,
  PaymentStatusResult,
  ProviderDeps,
  RequestPaymentInput,
  RequestPaymentResult,
} from './types';

const PROVIDER = 'mtn';

const DEFAULT_BASE_URLS = {
  sandbox: 'https://sandbox.momodeveloper.mtn.com',
  production: 'https://proxy.momoapi.mtn.com',
} as const;

// X-Target-Environment de la production MTN Congo-Brazzaville.
const DEFAULT_TARGET_ENVIRONMENTS = { sandbox: 'sandbox', production: 'mtncongo' } as const;

const REQUIRED = ['subscriptionKey', 'apiUserId', 'apiKey'] as const;

/** Map d'un statut MTN Collection (+ motif) vers le statut unifié. */
export function mapMtnStatus(status: unknown, reason: unknown): PaymentStatusResult {
  const r = typeof reason === 'string' ? reason : (reason as { code?: string } | undefined)?.code;
  switch (status) {
    case 'SUCCESSFUL':
      return { status: 'succeeded' };
    case 'FAILED':
    case 'REJECTED':
      if (r === 'EXPIRED') return { status: 'expired', failureReason: r };
      return { status: 'failed', failureReason: r ?? String(status) };
    default:
      return { status: 'pending' };
  }
}

export class MtnMobileMoneyProvider implements MobileMoneyProvider {
  readonly operator = PROVIDER;
  private readonly http: HttpClient;
  private readonly cache: TokenCache;
  private readonly baseUrl: string;
  private readonly targetEnvironment: string;
  private readonly creds: Record<(typeof REQUIRED)[number], string>;

  constructor(
    private readonly connection: MobileMoneyConnection,
    private readonly deps: ProviderDeps = {},
  ) {
    this.creds = resolveCredentials(PROVIDER, connection, REQUIRED);
    this.http = deps.http ?? createFetchHttpClient(PROVIDER);
    this.cache = deps.tokenCache ?? new MemoryTokenCache();
    this.baseUrl = connection.credentials.baseUrl || DEFAULT_BASE_URLS[connection.environment];
    this.targetEnvironment =
      connection.credentials.targetEnvironment || DEFAULT_TARGET_ENVIRONMENTS[connection.environment];
  }

  private retry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, { sleep: this.deps.sleep });
  }

  private tokenKey(): string {
    return `mtn:collection:${this.connection.environment}:${this.creds.apiUserId}`;
  }

  private async accessToken(force = false): Promise<string> {
    const key = this.tokenKey();
    const cached = force ? null : await this.cache.get(key);
    if (cached) return cached;

    const basic = Buffer.from(`${this.creds.apiUserId}:${this.creds.apiKey}`).toString('base64');
    const res = await this.retry(async () => {
      const r = await this.http.request({
        method: 'POST',
        url: `${this.baseUrl}/collection/token/`,
        headers: { Authorization: `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': this.creds.subscriptionKey },
      });
      if (r.status !== 200) throw errorFromHttpStatus(PROVIDER, r.status, 'Jeton MTN');
      return r;
    });
    const token = res.data?.access_token;
    if (typeof token !== 'string') throw new ProviderError('unknown', 'Réponse jeton MTN invalide', { provider: PROVIDER });
    await this.cache.set(key, token, tokenTtlSeconds(res.data?.expires_in));
    return token;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.accessToken()}`,
      'X-Target-Environment': this.targetEnvironment,
      'Ocp-Apim-Subscription-Key': this.creds.subscriptionKey,
    };
  }

  /** Identifiants valides si l'opérateur délivre un jeton (sans cache : vraie vérification). */
  async verifyCredentials(): Promise<void> {
    await this.accessToken(true);
  }

  /** L'identifiant MTN (X-Reference-Id) est dérivé de la référence AlphaPay. */
  static providerRefFor(reference: string): string {
    return deterministicUuid('mtn-collection', reference);
  }

  async requestPayment(input: RequestPaymentInput): Promise<RequestPaymentResult> {
    assertAmount(PROVIDER, input.amount, input.currency);
    assertE164(PROVIDER, input.payerPhone, 'payerPhone');
    const providerRef = MtnMobileMoneyProvider.providerRefFor(input.reference);

    await this.retry(async () => {
      const headers: Record<string, string> = { ...(await this.authHeaders()), 'X-Reference-Id': providerRef };
      if (this.connection.callbackUrl) headers['X-Callback-Url'] = this.connection.callbackUrl;
      const r = await this.http.request({
        method: 'POST',
        url: `${this.baseUrl}/collection/v1_0/requesttopay`,
        headers,
        body: {
          amount: toMajorString(input.amount, input.currency),
          currency: input.currency,
          externalId: input.reference,
          payer: { partyIdType: 'MSISDN', partyId: toMsisdn(input.payerPhone) },
          payerMessage: input.description ?? input.reference,
          payeeNote: input.reference,
        },
      });
      // 409 : même X-Reference-Id déjà reçu (rejeu après coupure) → demande déjà acceptée.
      if (r.status === 202 || r.status === 409) return;
      throw errorFromHttpStatus(PROVIDER, r.status, 'requestToPay MTN');
    });

    return { providerRef, status: 'pending' };
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentStatusResult> {
    const res = await this.retry(async () => {
      const r = await this.http.request({
        method: 'GET',
        url: `${this.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(providerRef)}`,
        headers: await this.authHeaders(),
      });
      if (r.status !== 200) throw errorFromHttpStatus(PROVIDER, r.status, 'Statut MTN');
      return r;
    });
    return mapMtnStatus(res.data?.status, res.data?.reason);
  }

  async verifyAccountHolder(phone: string): Promise<AccountHolderResult> {
    assertE164(PROVIDER, phone);
    const msisdn = toMsisdn(phone);
    const res = await this.retry(async () => {
      const r = await this.http.request({
        method: 'GET',
        url: `${this.baseUrl}/collection/v1_0/accountholder/msisdn/${msisdn}/active`,
        headers: await this.authHeaders(),
      });
      if (r.status === 404) return { status: 200, data: { result: false }, headers: {} };
      if (r.status !== 200) throw errorFromHttpStatus(PROVIDER, r.status, 'Titulaire MTN');
      return r;
    });
    return { active: res.data?.result === true };
  }

  /**
   * Callback MTN (PUT sur X-Callback-Url) : le corps porte `externalId` (notre
   * référence), d'où l'on redérive l'identifiant MTN.
   */
  parseCallback(req: IncomingRequest): CallbackResult | null {
    const body = req.body as { externalId?: unknown; status?: unknown; reason?: unknown } | undefined;
    if (!body || typeof body.externalId !== 'string' || typeof body.status !== 'string') return null;
    const mapped = mapMtnStatus(body.status, body.reason);
    return { providerRef: MtnMobileMoneyProvider.providerRefFor(body.externalId), ...mapped };
  }
}

export const mtnProviderFactory: MobileMoneyProviderFactory = {
  operator: PROVIDER,
  requiredCredentials: REQUIRED,
  create: (connection, deps) => new MtnMobileMoneyProvider(connection, deps),
};
