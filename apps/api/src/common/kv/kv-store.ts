import Redis from 'ioredis';

/**
 * Magasin clé-valeur à durée de vie (OTP, limites, boîte d'envoi de dev).
 * Redis en fonctionnement normal ; mémoire pour les tests et le dev sans Redis.
 * Toutes les opérations utilisées sont atomiques côté Redis.
 */
export abstract class KvStore {
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Pose la clé seulement si elle n'existe pas ; renvoie true si posée. */
  abstract setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Supprime ; renvoie le nombre de clés supprimées (0 ou 1). */
  abstract del(key: string): Promise<number>;
  /** Incrémente ; pose la durée de vie à la création du compteur. */
  abstract incr(key: string, ttlSeconds: number): Promise<number>;
  /** Durée de vie restante en secondes (-2 si absente). */
  abstract ttl(key: string): Promise<number>;
  /** Ajoute en tête d'une liste bornée à `max` éléments. */
  abstract pushCapped(key: string, value: string, max: number, ttlSeconds: number): Promise<void>;
  abstract list(key: string, max: number): Promise<string[]>;
}

export class RedisKvStore extends KvStore {
  constructor(private readonly redis: Redis) {
    super();
  }

  get(key: string) {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    return (await this.redis.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
  }

  del(key: string) {
    return this.redis.del(key);
  }

  async incr(key: string, ttlSeconds: number) {
    const [[, count]] = (await this.redis.multi().incr(key).expire(key, ttlSeconds, 'NX').exec()) as [[unknown, number]];
    return count;
  }

  ttl(key: string) {
    return this.redis.ttl(key);
  }

  async pushCapped(key: string, value: string, max: number, ttlSeconds: number) {
    await this.redis.multi().lpush(key, value).ltrim(key, 0, max - 1).expire(key, ttlSeconds).exec();
  }

  list(key: string, max: number) {
    return this.redis.lrange(key, 0, max - 1);
  }
}

export class MemoryKvStore extends KvStore {
  private readonly data = new Map<string, { value: string | string[]; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {
    super();
  }

  private live(key: string) {
    const e = this.data.get(key);
    if (e && this.now() >= e.expiresAt) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }

  async get(key: string) {
    const v = this.live(key)?.value;
    return typeof v === 'string' ? v : null;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.data.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.live(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async del(key: string) {
    return this.live(key) && this.data.delete(key) ? 1 : 0;
  }

  async incr(key: string, ttlSeconds: number) {
    const e = this.live(key);
    const next = (e ? Number(e.value) : 0) + 1;
    this.data.set(key, { value: String(next), expiresAt: e?.expiresAt ?? this.now() + ttlSeconds * 1000 });
    return next;
  }

  async ttl(key: string) {
    const e = this.live(key);
    return e ? Math.ceil((e.expiresAt - this.now()) / 1000) : -2;
  }

  async pushCapped(key: string, value: string, max: number, ttlSeconds: number) {
    const e = this.live(key);
    const items = [value, ...(Array.isArray(e?.value) ? e!.value : [])].slice(0, max);
    this.data.set(key, { value: items, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async list(key: string, max: number) {
    const v = this.live(key)?.value;
    return Array.isArray(v) ? v.slice(0, max) : [];
  }
}
