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
});
