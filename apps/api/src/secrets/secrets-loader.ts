import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

/**
 * Charge les secrets applicatifs (credentials DB, JWT pepper, secrets HMAC
 * connecteurs, clés Clerk, clés SMS/email) depuis AWS Secrets Manager et les
 * injecte dans process.env avant que ConfigModule ne soit initialisé.
 *
 * En production, AWS_SECRETS_MANAGER_SECRET_ID est obligatoire — aucun secret
 * ne doit transiter par .env. En dev local, son absence est tolérée et
 * process.env (chargé depuis .env) reste la seule source.
 */
export async function loadSecretsFromAws(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const secretId = env.AWS_SECRETS_MANAGER_SECRET_ID;

  if (!secretId) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'AWS_SECRETS_MANAGER_SECRET_ID est requis en production (zéro secret en .env hors dev local)',
      );
    }
    return;
  }

  const client = new SecretsManagerClient({ region: env.AWS_REGION ?? 'eu-west-1' });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (!response.SecretString) {
    throw new Error(`Le secret "${secretId}" ne contient pas de SecretString`);
  }

  const secrets: Record<string, string> = JSON.parse(response.SecretString);
  for (const [key, value] of Object.entries(secrets)) {
    env[key] = value;
  }

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
