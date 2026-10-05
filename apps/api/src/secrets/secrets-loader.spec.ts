import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSecrets } from './secrets-loader';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('loadSecrets', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('does nothing in dev when no secret id is configured', async () => {
    const env = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;
    await loadSecrets(env);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws in production when no secret id is configured (zéro secret en .env)', async () => {
    const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    await expect(loadSecrets(env)).rejects.toThrow(/AWS_SECRETS_MANAGER_SECRET_ID/);
  });

  it('fetches the secret and injects every key into process.env', async () => {
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({ DATABASE_URL: 'postgres://prod', JWT_SECRET: 'pepper' }),
    });
    const env = { NODE_ENV: 'production', AWS_SECRETS_MANAGER_SECRET_ID: 'paybrain/prod/env' } as NodeJS.ProcessEnv;

    await loadSecrets(env);

    expect(env.DATABASE_URL).toBe('postgres://prod');
    expect(env.JWT_SECRET).toBe('pepper');
  });

  it('throws when the secret has no SecretString', async () => {
    sendMock.mockResolvedValue({});
    const env = { NODE_ENV: 'production', AWS_SECRETS_MANAGER_SECRET_ID: 'paybrain/prod/env' } as NodeJS.ProcessEnv;

    await expect(loadSecrets(env)).rejects.toThrow(/SecretString/);
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

    await loadSecrets(env);

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

    await loadSecrets(env);

    expect(env.REDIS_URL).toBe('rediss://existing');
    expect(sendMock).toHaveBeenCalledTimes(1); // app_env seulement, pas le secret redis
  });

  describe('SECRETS_FILE (secret Docker sur VPS)', () => {
    const writeSecrets = (content: string) => {
      const file = join(mkdtempSync(join(tmpdir(), 'secrets-')), 'app_env');
      writeFileSync(file, content);
      return file;
    };

    it('injects every key from the file without calling AWS', async () => {
      const file = writeSecrets(JSON.stringify({ DATABASE_URL: 'postgres://vps', REDIS_URL: 'redis://:pw@redis:6379' }));
      const env = { NODE_ENV: 'production', SECRETS_FILE: file } as NodeJS.ProcessEnv;

      await loadSecrets(env);

      expect(env.DATABASE_URL).toBe('postgres://vps');
      expect(env.REDIS_URL).toBe('redis://:pw@redis:6379');
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('takes precedence over AWS Secrets Manager', async () => {
      const file = writeSecrets(JSON.stringify({ JWT_SECRET: 'from-file' }));
      const env = {
        NODE_ENV: 'production',
        SECRETS_FILE: file,
        AWS_SECRETS_MANAGER_SECRET_ID: 'paybrain/prod/env',
      } as NodeJS.ProcessEnv;

      await loadSecrets(env);

      expect(env.JWT_SECRET).toBe('from-file');
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('fails closed when the file is missing', async () => {
      const env = { NODE_ENV: 'production', SECRETS_FILE: join(tmpdir(), 'absent-app-env') } as NodeJS.ProcessEnv;
      await expect(loadSecrets(env)).rejects.toThrow(/ENOENT/);
    });

    it('rejects invalid content without leaking it in the error', async () => {
      const file = writeSecrets('JWT_SECRET=super-secret-value');
      const env = { NODE_ENV: 'production', SECRETS_FILE: file } as NodeJS.ProcessEnv;

      await expect(loadSecrets(env)).rejects.toThrow(/JSON valide/);
      await expect(loadSecrets(env)).rejects.not.toThrow(/super-secret-value/);
    });
  });
});
