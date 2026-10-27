import Redis from 'ioredis';
import { MemoryTokenCache, TokenCache } from '@paybrain/providers';

/**
 * Cache des jetons opérateur partagé entre instances (§M3). Sans REDIS_URL
 * (tests, dev sans Redis), repli sur un cache mémoire par process.
 */
export class RedisTokenCache implements TokenCache {
  private readonly prefix = 'provider-token:';

  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(this.prefix + key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(this.prefix + key, value, 'EX', ttlSeconds);
  }
}

export function createTokenCache(): TokenCache {
  const url = process.env.REDIS_URL;
  if (!url) return new MemoryTokenCache();
  const client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
  client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error(`[provider-token-cache] Redis indisponible: ${err?.message}`);
  });
  return new RedisTokenCache(client);
}
