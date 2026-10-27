import { errorFromHttpStatus, ProviderError } from '../core/errors';
import { createFetchHttpClient, HttpClient, withRetry } from '../core/http';
import { MemoryTokenCache, TokenCache, tokenTtlSeconds } from '../core/token-cache';
import { assertAmount, assertE164, deterministicUuid, toMajorString } from '../core/validation';
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

const PROVIDER = 'airtel';
const COUNTRY = 'CG';
const COUNTRY_CODE = '242';

const DEFAULT_BASE_URLS = {
  sandbox: 'https://openapiuat.airtel.africa',
  production: 'https://openapi.airtel.africa',
} as const;

const REQUIRED = ['clientId', 'clientSecret'] as const;

/**
 * Codes de transaction Airtel : TS succès, TF échec, TE expiré, TA ambigu,
 * TIP en cours. Un statut ambigu reste en attente : la tâche de relance
 * réinterroge jusqu'au statut final ou à l'expiration AlphaPay.
 */
export function mapAirtelStatus(code: unknown, message?: unknown): PaymentStatusResult {
  const reason = typeof message === 'string' && message ? message : undefined;
  switch (code) {
    case 'TS':
      return { status: 'succeeded' };
    case 'TF':
      return { status: 'failed', failureReason: reason ?? 'TF' };
    case 'TE':
      return { status: 'expired', failureReason: reason ?? 'TE' };
    default:
      return { status: 'pending' };
  }
}

/** Airtel attend le numéro national, sans indicatif pays. */
function nationalNumber(phone: string): string {
  const digits = phone.slice(1);
  if (!digits.startsWith(COUNTRY_CODE)) {
    throw new ProviderError('invalid_request', 'Airtel Money : numéro du Congo (+242) attendu', { provider: PROVIDER });
  }
  return digits.slice(COUNTRY_CODE.length);
}

export class AirtelMobileMoneyProvider implements MobileMoneyProvider {
  readonly operator = PROVIDER;
  private readonly http: HttpClient;
  private readonly cache: TokenCache;
  private readonly baseUrl: string;
  private readonly creds: Record<(typeof REQUIRED)[number], string>;

  constructor(
    private readonly connection: MobileMoneyConnection,
    private readonly deps: ProviderDeps = {},
  ) {
    this.creds = resolveCredentials(PROVIDER, connection, REQUIRED);
    this.http = deps.http ?? createFetchHttpClient(PROVIDER);
    this.cache = deps.tokenCache ?? new MemoryTokenCache();
    this.baseUrl = connection.credentials.baseUrl || DEFAULT_BASE_URLS[connection.environment];
  }

  private retry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, { sleep: this.deps.sleep });
  }

  private async accessToken(): Promise<string> {
    const key = `airtel:${this.connection.environment}:${this.creds.clientId}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const res = await this.retry(async () => {
      const r = await this.http.request({
        method: 'POST',
        url: `${this.baseUrl}/auth/oauth2/token`,
        body: { client_id: this.creds.clientId, client_secret: this.creds.clientSecret, grant_type: 'client_credentials' },
      });
      if (r.status !== 200) throw errorFromHttpStatus(PROVIDER, r.status, 'Jeton Airtel');
      return r;
    });
    const token = res.data?.access_token;
    if (typeof token !== 'string') throw new ProviderError('unknown', 'Réponse jeton Airtel invalide', { provider: PROVIDER });
    await this.cache.set(key, token, tokenTtlSeconds(res.data?.expires_in));
    return token;
  }

  private async headers(currency: string): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.accessToken()}`, 'X-Country': COUNTRY, 'X-Currency': currency };
  }

  /** L'identifiant de transaction Airtel est dérivé de la référence AlphaPay. */
  static providerRefFor(reference: string): string {
    return deterministicUuid('airtel-collection', reference);
  }

  async requestPayment(input: RequestPaymentInput): Promise<RequestPaymentResult> {
    assertAmount(PROVIDER, input.amount, input.currency);
    assertE164(PROVIDER, input.payerPhone, 'payerPhone');
    const msisdn = nationalNumber(input.payerPhone);
    const providerRef = AirtelMobileMoneyProvider.providerRefFor(input.reference);

    await this.retry(async () => {
      const r = await this.http.request({
        method: 'POST',
        url: `${this.baseUrl}/merchant/v2/payments/`,
        headers: await this.headers(input.currency),
        body: {
          reference: input.description ?? input.reference,
          subscriber: { country: COUNTRY, currency: input.currency, msisdn },
          transaction: {
            amount: Number(toMajorString(input.amount, input.currency)),
            country: COUNTRY,
            currency: input.currency,
            id: providerRef,
          },
        },
      });
      // 409 : identifiant de transaction déjà reçu (rejeu après coupure) → déjà acceptée.
      if (r.status === 409) return;
      if (r.status !== 200) throw errorFromHttpStatus(PROVIDER, r.status, 'Paiement Airtel');
      if (r.data?.status?.success === false) {
        throw new ProviderError('rejected', `Paiement Airtel refusé (${r.data?.status?.response_code ?? 'inconnu'})`, {
          provider: PROVIDER,
        });
      }
    });

    return { providerRef, status: 'pending' };
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentStatusResult> {
    const res = await this.retry(async () => {
      const r = await this.http.request({
        method: 'GET',
        url: `${this.baseUrl}/standard/v1/payments/${encodeURIComponent(providerRef)}`,
        headers: await this.headers('XAF'),
      });
      if (r.status !== 200) throw errorFromHttpStatus(PROVIDER, r.status, 'Statut Airtel');
      return r;
    });
    const tx = res.data?.data?.transaction;
    return mapAirtelStatus(tx?.status, tx?.message);
  }

  async verifyAccountHolder(phone: string): Promise<AccountHolderResult> {
    assertE164(PROVIDER, phone);
    const res = await this.retry(async () => {
      const r = await this.http.request({
        method: 'GET',
        url: `${this.baseUrl}/standard/v1/users/${nationalNumber(phone)}`,
        headers: await this.headers('XAF'),
      });
      if (r.status === 404) return { status: 200, data: {}, headers: {} };
      if (r.status !== 200) throw errorFromHttpStatus(PROVIDER, r.status, 'Titulaire Airtel');
      return r;
    });
    const user = res.data?.data;
    if (!user) return { active: false };
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || undefined;
    return { active: user.is_barred !== true, name };
  }

  /** Callback Airtel : `{ transaction: { id, status_code, message } }`. */
  parseCallback(req: IncomingRequest): CallbackResult | null {
    const tx = (req.body as { transaction?: { id?: unknown; status_code?: unknown; message?: unknown } } | undefined)
      ?.transaction;
    if (!tx || typeof tx.id !== 'string' || typeof tx.status_code !== 'string') return null;
    return { providerRef: tx.id, ...mapAirtelStatus(tx.status_code, tx.message) };
  }
}

export const airtelProviderFactory: MobileMoneyProviderFactory = {
  operator: PROVIDER,
  requiredCredentials: REQUIRED,
  create: (connection, deps) => new AirtelMobileMoneyProvider(connection, deps),
};
