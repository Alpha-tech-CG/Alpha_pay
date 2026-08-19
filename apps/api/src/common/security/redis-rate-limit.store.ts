import Redis from 'ioredis';
import type { Store, Options, IncrementResponse } from 'express-rate-limit';

/**
 * Store Redis partagé pour express-rate-limit.
 *
 * Le MemoryStore par défaut est PAR INSTANCE : avec N pods, la limite effective
 * est N× la limite configurée — ce qui affaiblit directement la protection
 * anti-brute-force du PIN wallet (/v1/wallet/auth, /v1/checkout). Un store Redis
 * partage le compteur entre toutes les instances → la limite est globale.
 *
 * Implémentation « fenêtre fixe » (INCR + PEXPIRE au premier hit), équivalente au
 * comportement de rate-limit-redis, mais sans dépendance supplémentaire :
 * ioredis est déjà présent. Activé uniquement si REDIS_URL est défini ; sinon on
 * laisse express-rate-limit retomber sur son MemoryStore (dev local sans Redis).
 */
class RedisRateLimitStore implements Store {
  private windowMs = 60_000;
  private readonly keyPrefix: string;

  constructor(
    private readonly client: Redis,
    keyPrefix: string,
  ) {
    this.keyPrefix = keyPrefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const rk = this.key(key);
    // INCR puis lit le TTL ; si la clé vient d'être créée (TTL == -1), on pose
    // l'expiration de la fenêtre. Pipeline = 1 aller-retour réseau.
    const results = await this.client.multi().incr(rk).pttl(rk).exec();
    const totalHits = Number(results?.[0]?.[1] ?? 0);
    let ttl = Number(results?.[1]?.[1] ?? -1);

    if (ttl < 0) {
      await this.client.pexpire(rk, this.windowMs);
      ttl = this.windowMs;
    }

    return { totalHits, resetTime: new Date(Date.now() + ttl) };
  }

  async decrement(key: string): Promise<void> {
    await this.client.decr(this.key(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }
}

let sharedClient: Redis | null = null;

function getSharedClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!sharedClient) {
    // lazyConnect + maxRetriesPerRequest borné : un incident Redis ne doit pas
    // faire pendre indéfiniment une requête sur le rate-limit.
    sharedClient = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    sharedClient.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(`[rate-limit] Redis indisponible: ${err?.message}`);
    });
  }
  return sharedClient;
}

/**
 * Renvoie un Store Redis partagé (préfixe distinct par limiteur pour éviter les
 * collisions de clés entre limiteurs), ou `undefined` si REDIS_URL n'est pas
 * défini — auquel cas express-rate-limit utilise son MemoryStore.
 */
export function createRateLimitStore(prefix: string): Store | undefined {
  const client = getSharedClient();
  if (!client) return undefined;
  return new RedisRateLimitStore(client, `rl:${prefix}:`);
}
