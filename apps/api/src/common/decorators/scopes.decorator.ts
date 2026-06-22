import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'required_scopes';

/**
 * Déclare les scopes requis pour une route. Vérifié par ScopesGuard contre les
 * scopes portés par la clé API (ALP-VULN : les scopes étaient stockés mais
 * jamais appliqués → une clé « lecture seule » pouvait tout écrire).
 */
export const RequiredScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
