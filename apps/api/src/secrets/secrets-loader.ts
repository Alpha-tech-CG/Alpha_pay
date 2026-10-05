import { readFile } from 'node:fs/promises';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * Charge les secrets applicatifs (credentials DB, JWT pepper, secrets HMAC
 * connecteurs, clés Clerk, clés SMS/email) et les injecte dans process.env
 * avant que ConfigModule ne soit initialisé. Deux sources possibles :
 *
 * - SECRETS_FILE : fichier JSON clé/valeur monté dans le conteneur (secret
 *   Docker, ex. /run/secrets/app_env) — hébergement VPS.
 * - AWS_SECRETS_MANAGER_SECRET_ID : AWS Secrets Manager (même format JSON).
 *
 * En production, l'une des deux est obligatoire — aucun secret ne doit
 * transiter par .env. En dev local, leur absence est tolérée et process.env
 * (chargé depuis .env) reste la seule source.
 */
export async function loadSecrets(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const secretsFile = env.SECRETS_FILE;
  if (secretsFile) {
    inject(parseSecrets(await readFile(secretsFile, 'utf8'), secretsFile), env);
    return;
  }

  const secretId = env.AWS_SECRETS_MANAGER_SECRET_ID;

  if (!secretId) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'SECRETS_FILE ou AWS_SECRETS_MANAGER_SECRET_ID est requis en production (zéro secret en .env hors dev local)',
      );
    }
    return;
  }

  const client = new SecretsManagerClient({ region: env.AWS_REGION ?? 'eu-west-1' });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (!response.SecretString) {
    throw new Error(`Le secret "${secretId}" ne contient pas de SecretString`);
  }

  inject(parseSecrets(response.SecretString, secretId), env);

  // REDIS_URL est stocké dans un secret DÉDIÉ (chaîne `rediss://…` avec AUTH),
  // distinct du blob app_env, dont l'ARN arrive via REDIS_URL_SECRET_ARN
  // (cf. terraform/elasticache.tf + ecs.tf). Sans cette injection, le rate-limit
  // partagé et le fanout WebSocket retombent silencieusement en mode
  // instance-unique en production. On ne l'écrase pas s'il est déjà présent.
  const redisArn = env.REDIS_URL_SECRET_ARN;
  if (redisArn && !env.REDIS_URL) {
    const redisResponse = await client.send(new GetSecretValueCommand({ SecretId: redisArn }));
    if (!redisResponse.SecretString) {
      throw new Error(`Le secret Redis "${redisArn}" ne contient pas de SecretString`);
    }
    env.REDIS_URL = redisResponse.SecretString;
  }
}

function parseSecrets(raw: string, source: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Ne jamais inclure le contenu dans l'erreur : ce sont des secrets.
    throw new Error(`Le secret "${source}" n'est pas un JSON valide`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Le secret "${source}" doit être un objet JSON clé/valeur`);
  }
  return parsed as Record<string, string>;
}

function inject(secrets: Record<string, string>, env: NodeJS.ProcessEnv): void {
  for (const [key, value] of Object.entries(secrets)) {
    env[key] = String(value);
  }
}
