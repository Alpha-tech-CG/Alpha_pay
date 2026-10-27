import { ProviderError } from '../core/errors';
import type { MobileMoneyConnection } from './types';

/**
 * Lit les identifiants requis d'une connexion marchand.
 * Hypothèse D-006 : un compte API opérateur par marchand. Si le modèle devient
 * « compte partenaire AlphaPay + sous-comptes », seule cette résolution (et
 * les fabriques qui l'appellent) change.
 */
export function resolveCredentials<K extends string>(
  provider: string,
  connection: MobileMoneyConnection,
  required: readonly K[],
): Record<K, string> {
  const missing = required.filter((k) => !connection.credentials[k]);
  if (missing.length > 0) {
    throw new ProviderError('not_configured', `Identifiants manquants : ${missing.join(', ')}`, { provider });
  }
  return Object.fromEntries(required.map((k) => [k, connection.credentials[k]])) as Record<K, string>;
}
