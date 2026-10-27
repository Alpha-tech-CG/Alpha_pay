import { MemoryTokenCache, MockMobileMoneyProvider, MtnMobileMoneyProvider } from '@paybrain/providers';
import { decryptCredentials, encryptCredentials } from './credentials-crypto';
import { MobileMoneyRegistry } from './mobile-money.registry';

describe('MobileMoneyRegistry', () => {
  const env = process.env;
  let prisma: { providerConnection: { findUnique: jest.Mock } };
  let registry: MobileMoneyRegistry;
  const credentials = { subscriptionKey: 'sub', apiUserId: 'user', apiKey: 'key' };

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.MOBILE_MONEY_TEST_PROVIDER;
    prisma = { providerConnection: { findUnique: jest.fn() } };
    registry = new MobileMoneyRegistry(prisma as any, new MemoryTokenCache(), null);
  });
  afterAll(() => {
    process.env = env;
  });

  it('mode test : opérateur factice, sans lire de connexion', async () => {
    expect(await registry.forMerchant('m', 'MTN', false)).toBeInstanceOf(MockMobileMoneyProvider);
    expect(prisma.providerConnection.findUnique).not.toHaveBeenCalled();
  });

  it('mode live : adaptateur réel avec les identifiants déchiffrés DU marchand', async () => {
    prisma.providerConnection.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      environment: 'production',
      credentialsEnc: encryptCredentials(credentials),
    });
    const provider = await registry.forMerchant('m-42', 'MTN', true);
    expect(provider).toBeInstanceOf(MtnMobileMoneyProvider);
    expect(prisma.providerConnection.findUnique).toHaveBeenCalledWith({
      where: { merchantId_operator_livemode: { merchantId: 'm-42', operator: 'MTN', livemode: true } },
    });
  });

  it.each([
    ['absente', null],
    ['en attente de connexion', { status: 'PENDING', environment: 'production', credentialsEnc: null }],
  ])('mode live, connexion %s : refus not_configured (jamais de repli sur le mock)', async (_l, connection) => {
    prisma.providerConnection.findUnique.mockResolvedValue(connection);
    await expect(registry.forMerchant('m', 'AIRTEL', true)).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('mode test + MOBILE_MONEY_TEST_PROVIDER=sandbox : sandbox réel si connecté, sinon mock', async () => {
    process.env.MOBILE_MONEY_TEST_PROVIDER = 'sandbox';
    prisma.providerConnection.findUnique.mockResolvedValueOnce(null);
    expect(await registry.forMerchant('m', 'MTN', false)).toBeInstanceOf(MockMobileMoneyProvider);

    prisma.providerConnection.findUnique.mockResolvedValueOnce({
      status: 'ACTIVE',
      environment: 'sandbox',
      credentialsEnc: encryptCredentials(credentials),
    });
    expect(await registry.forMerchant('m', 'MTN', false)).toBeInstanceOf(MtnMobileMoneyProvider);
  });
});

describe('credentials-crypto', () => {
  it('chiffre et déchiffre, sans clair dans le blob', () => {
    const blob = encryptCredentials({ apiKey: 'super-secret-key' });
    expect(Buffer.from(blob).toString('utf8')).not.toContain('super-secret-key');
    expect(decryptCredentials(blob)).toEqual({ apiKey: 'super-secret-key' });
  });
});
