/**
 * Cache des jetons d'accès fournisseurs. En production, l'API fournit une
 * implémentation Redis (§M3 : jetons en cache jusqu'à expiration, partagés
 * entre instances) ; la version mémoire sert aux tests et au mode local.
 */
export interface TokenCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export class MemoryTokenCache implements TokenCache {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }
}

/** Durée de cache d'un jeton : son expiration annoncée moins une marge de sécurité. */
export function tokenTtlSeconds(expiresIn: unknown, fallbackSeconds = 3600, marginSeconds = 60): number {
  const n = Number(expiresIn);
  const base = Number.isFinite(n) && n > 0 ? n : fallbackSeconds;
  return Math.max(base - marginSeconds, 1);
}
