import { ProviderError, errorFromHttpStatus } from './errors';
import { withRetry } from './http';
import { MemoryTokenCache, tokenTtlSeconds } from './token-cache';
import { deterministicUuid, toMajorString } from './validation';

describe('toMajorString', () => {
  it.each([
    [15000, 'XAF', '15000'],
    [150, 'EUR', '1.50'],
    [5, 'EUR', '0.05'],
    [100000, 'EUR', '1000.00'],
  ])('%d %s → %s', (amount, currency, expected) => {
    expect(toMajorString(amount, currency)).toBe(expected);
  });
});

describe('deterministicUuid', () => {
  it('est stable pour une même référence et différent sinon', () => {
    const a = deterministicUuid('ns', 'ref-1');
    expect(a).toBe(deterministicUuid('ns', 'ref-1'));
    expect(a).not.toBe(deterministicUuid('ns', 'ref-2'));
    expect(a).not.toBe(deterministicUuid('autre', 'ref-1'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('errorFromHttpStatus', () => {
  it.each([
    [400, 'invalid_request', false],
    [401, 'auth_failed', false],
    [404, 'not_found', false],
    [429, 'rate_limited', true],
    [503, 'unavailable', true],
  ])('%d → %s (réessayable : %s)', (status, code, retryable) => {
    expect(errorFromHttpStatus('x', status, 'ctx')).toMatchObject({ code, retryable });
  });
});

describe('withRetry', () => {
  it('réessaie les erreurs réessayables puis abandonne', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new ProviderError('unavailable', 'x', { provider: 'p' });
        },
        { retries: 2, sleep: async () => {} },
      ),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(calls).toBe(3);
  });

  it('ne réessaie pas une erreur définitive', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new ProviderError('invalid_request', 'x', { provider: 'p' });
        },
        { sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
  });
});

describe('MemoryTokenCache', () => {
  it('expire les jetons', async () => {
    let now = 0;
    const cache = new MemoryTokenCache(() => now);
    await cache.set('k', 'v', 10);
    expect(await cache.get('k')).toBe('v');
    now += 10_000;
    expect(await cache.get('k')).toBeNull();
  });

  it('retire une marge de sécurité à la durée annoncée', () => {
    expect(tokenTtlSeconds(3600)).toBe(3540);
    expect(tokenTtlSeconds(undefined)).toBe(3540);
    expect(tokenTtlSeconds(30)).toBe(1);
  });
});
