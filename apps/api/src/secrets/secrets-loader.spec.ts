import { loadSecretsFromAws } from './secrets-loader';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('loadSecretsFromAws', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('does nothing in dev when no secret id is configured', async () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;
    await loadSecretsFromAws(env);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws in production when no secret id is configured (zéro secret en .env)', async () => {
    const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    await expect(loadSecretsFromAws(env)).rejects.toThrow(/AWS_SECRETS_MANAGER_SECRET_ID/);
  });

  it('fetches the secret and injects every key into process.env', async () => {
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({ DATABASE_URL: 'postgres://prod', JWT_SECRET: 'pepper' }),
    });
    const env = { NODE_ENV: 'production', AWS_SECRETS_MANAGER_SECRET_ID: 'paybrain/prod/env' } as NodeJS.ProcessEnv;

    await loadSecretsFromAws(env);

    expect(env.DATABASE_URL).toBe('postgres://prod');
    expect(env.JWT_SECRET).toBe('pepper');
  });

  it('throws when the secret has no SecretString', async () => {
    sendMock.mockResolvedValue({});
    const env = { NODE_ENV: 'production', AWS_SECRETS_MANAGER_SECRET_ID: 'paybrain/prod/env' } as NodeJS.ProcessEnv;

    await expect(loadSecretsFromAws(env)).rejects.toThrow(/SecretString/);
  });

  it('injects REDIS_URL from the dedicated redis-url secret ARN', async () => {
    sendMock
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ DATABASE_URL: 'postgres://prod' }) })
      .mockResolvedValueOnce({ SecretString: 'rediss://:token@redis-prod:6379' });
    const env = {
      NODE_ENV: 'production',
      AWS_SECRETS_MANAGER_SECRET_ID: 'paybrain/prod/env',
      REDIS_URL_SECRET_ARN: 'arn:aws:secretsmanager:eu-west-1:0:secret:redis-url',
    } as NodeJS.ProcessEnv;

    await loadSecretsFromAws(env);

    expect(env.DATABASE_URL).toBe('postgres://prod');
    expect(env.REDIS_URL).toBe('rediss://:token@redis-prod:6379');
  });

  it('does not overwrite an already-set REDIS_URL (and skips the redis fetch)', async () => {
    sendMock.mockResolvedValueOnce({ SecretString: JSON.stringify({}) });
    const env = {
      NODE_ENV: 'production',
      AWS_SECRETS_MANAGER_SECRET_ID: 'paybrain/prod/env',
      REDIS_URL_SECRET_ARN: 'arn:aws:secretsmanager:eu-west-1:0:secret:redis-url',
      REDIS_URL: 'rediss://existing',
    } as NodeJS.ProcessEnv;

    await loadSecretsFromAws(env);

    expect(env.REDIS_URL).toBe('rediss://existing');
    expect(sendMock).toHaveBeenCalledTimes(1); // app_env seulement, pas le secret redis
  });
});
