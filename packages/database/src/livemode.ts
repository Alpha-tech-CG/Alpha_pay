import type { PrismaClient } from '@prisma/client';

/**
 * Séparation stricte test / live (§4.6). Pour les modèles ci-dessous, toute
 * requête de lecture ou de mise à jour en masse DOIT préciser `livemode` dans
 * son `where`, et toute création doit le fixer explicitement. Un oubli lève
 * une erreur au lieu de mélanger silencieusement les deux espaces.
 *
 * Exceptions légitimes :
 * - une requête ciblant un `id` précis (identifiant unique, sans ambiguïté) ;
 * - `ANY_MODE`, à utiliser délibérément quand les deux modes sont voulus
 *   (ex. callback opérateur qui retrouve une transaction par sa référence).
 */
export const LIVEMODE_MODELS = new Set([
  'Transaction',
  'PaymentLink',
  'WebhookEndpoint',
  'ProviderConnection',
  'IdempotencyRecord',
  'Message',
  'OtpAudit',
  'CreditLedger',
]);

/**
 * Filtre explicite « les deux modes » : la clé `livemode` est présente (le
 * garde la voit) mais sans valeur, donc Prisma ne filtre pas.
 */
export const ANY_MODE = undefined;

const SCOPED_READS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);
const CREATES = new Set(['create', 'createMany', 'createManyAndReturn']);

export class LivemodeScopeError extends Error {
  constructor(model: string, operation: string) {
    super(`${model}.${operation} sans livemode : précisez le mode (test/live) ou ANY_MODE (§4.6)`);
    this.name = 'LivemodeScopeError';
  }
}

function hasLivemode(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const w = where as Record<string, unknown>;
  if ('livemode' in w) return true;
  if (typeof w.id === 'string') return true;
  // { AND: [...] } : le filtre peut être porté par l'une des conditions.
  return Array.isArray(w.AND) && w.AND.some(hasLivemode);
}

export function assertLivemodeScoped(model: string | undefined, operation: string, args: any): void {
  if (!model || !LIVEMODE_MODELS.has(model)) return;
  if (SCOPED_READS.has(operation) && !hasLivemode(args?.where)) {
    throw new LivemodeScopeError(model, operation);
  }
  if (CREATES.has(operation)) {
    const rows = Array.isArray(args?.data) ? args.data : [args?.data];
    if (rows.some((row: any) => typeof row?.livemode !== 'boolean')) throw new LivemodeScopeError(model, operation);
  }
}

/** Client Prisma muni du garde livemode. */
export function withLivemodeGuard<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'livemode-guard',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertLivemodeScoped(model, operation, args);
          return query(args);
        },
      },
    },
  });
}
