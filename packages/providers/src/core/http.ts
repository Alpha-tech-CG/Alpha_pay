import { ProviderError } from './errors';

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  /** Corps JSON (sérialisé par le client) ou chaîne brute. */
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  data: any;
  headers: Record<string, string>;
}

/**
 * Client HTTP minimal injecté dans les adaptateurs : remplaçable par un faux
 * serveur dans les tests de contrat. Ne lève JAMAIS sur un statut HTTP
 * d'erreur (l'adaptateur décide) ; lève une ProviderError `network` si la
 * requête n'aboutit pas (DNS, coupure, délai dépassé).
 */
export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

export function createFetchHttpClient(provider: string, defaultTimeoutMs = 15_000): HttpClient {
  return {
    async request(req) {
      const headers: Record<string, string> = { ...req.headers };
      let body: string | undefined;
      if (req.body !== undefined) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        headers['Content-Type'] ??= 'application/json';
      }
      let res: Response;
      try {
        res = await fetch(req.url, {
          method: req.method,
          headers,
          body,
          signal: AbortSignal.timeout(req.timeoutMs ?? defaultTimeoutMs),
        });
      } catch {
        throw new ProviderError('network', `Requête ${req.method} non aboutie`, { provider });
      }
      const text = await res.text();
      let data: unknown = text;
      if (text && (res.headers.get('content-type') ?? '').includes('json')) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      const outHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => (outHeaders[key] = value));
      return { status: res.status, data, headers: outHeaders };
    },
  };
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Réessaie une opération tant qu'elle lève une ProviderError réessayable
 * (réseau, 5xx, 429), avec délai exponentiel et gigue.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 300, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof ProviderError && err.retryable;
      if (!retryable || attempt >= retries) throw err;
      await sleep(baseDelayMs * 2 ** attempt + Math.random() * 100);
    }
  }
}
