export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: any) => boolean;
}

export function isTransientError(error: any): boolean {
  if (!error?.response) return true; // network error, DNS failure, timeout
  const status = error.response.status;
  return status === 429 || status >= 500;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 300, shouldRetry = isTransientError } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) throw error;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
