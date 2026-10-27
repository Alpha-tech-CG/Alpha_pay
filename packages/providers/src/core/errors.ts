/**
 * Erreur unique remontée par tous les adaptateurs de fournisseurs.
 * `retryable` dit au service appelant (file de tâches) s'il peut réessayer.
 * Le message ne doit jamais contenir de donnée personnelle ni de secret.
 */
export type ProviderErrorCode =
  | 'invalid_request'
  | 'auth_failed'
  | 'not_found'
  | 'rejected'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'invalid_signature'
  | 'not_configured'
  | 'unknown';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly provider: string;
  readonly httpStatus?: number;

  constructor(
    code: ProviderErrorCode,
    message: string,
    opts: { provider: string; retryable?: boolean; httpStatus?: number },
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.provider = opts.provider;
    this.httpStatus = opts.httpStatus;
    this.retryable = opts.retryable ?? (code === 'rate_limited' || code === 'unavailable' || code === 'network');
  }
}

/** Traduit un statut HTTP d'erreur en ProviderError (réseau, 5xx et 429 réessayables). */
export function errorFromHttpStatus(provider: string, status: number, context: string): ProviderError {
  const message = `${context} : HTTP ${status}`;
  if (status === 400 || status === 422) return new ProviderError('invalid_request', message, { provider, httpStatus: status });
  if (status === 401 || status === 403) return new ProviderError('auth_failed', message, { provider, httpStatus: status });
  if (status === 404) return new ProviderError('not_found', message, { provider, httpStatus: status });
  if (status === 429) return new ProviderError('rate_limited', message, { provider, httpStatus: status });
  if (status >= 500) return new ProviderError('unavailable', message, { provider, httpStatus: status });
  return new ProviderError('unknown', message, { provider, httpStatus: status });
}
