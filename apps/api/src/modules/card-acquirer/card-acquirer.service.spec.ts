import { CardAcquirerService, cardPaymentsEnabled } from './card-acquirer.service';

const BASE_PARAMS = {
  merchantId: 'm-1',
  amount: 5000,
  currency: 'XAF',
  reference: 'cmd-test-1',
  returnUrl: 'https://example.com/return',
};

describe('cardPaymentsEnabled', () => {
  it('retourne false quand FEATURE_CARD_PAYMENTS est absent', () => {
    delete process.env.FEATURE_CARD_PAYMENTS;
    expect(cardPaymentsEnabled()).toBe(false);
  });

  it('retourne true quand FEATURE_CARD_PAYMENTS=true', () => {
    process.env.FEATURE_CARD_PAYMENTS = 'true';
    expect(cardPaymentsEnabled()).toBe(true);
    delete process.env.FEATURE_CARD_PAYMENTS;
  });
});

describe('CardAcquirerService.createSession (mock)', () => {
  beforeEach(() => {
    delete process.env.CARD_ACQUIRER_URL;
    process.env.CARD_ACQUIRER_MOCK = 'true';
  });
  afterEach(() => {
    delete process.env.CARD_ACQUIRER_MOCK;
  });

  it('retourne une session avec redirectUrl vers /mock/card/', async () => {
    const svc = new CardAcquirerService();
    const session = await svc.createSession(BASE_PARAMS);
    expect(session.sessionId).toHaveLength(32);
    expect(session.redirectUrl).toContain('/mock/card/');
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('inclut le montant et la référence dans le redirectUrl mock', async () => {
    const svc = new CardAcquirerService();
    const session = await svc.createSession(BASE_PARAMS);
    expect(session.redirectUrl).toContain('amount=5000');
    expect(session.redirectUrl).toContain('cmd-test-1');
  });
});
