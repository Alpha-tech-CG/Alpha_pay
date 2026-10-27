import { MemoryTokenCache } from '../core/token-cache';
import { FakeAirtelServer, FakeMtnServer } from '../testing/fake-operator-servers';
import { describeMobileMoneyContract } from '../testing/mobile-money.contract';
import { AirtelMobileMoneyProvider, airtelProviderFactory } from './airtel.adapter';
import { MOCK_MOBILE_MONEY_NUMBERS, MockMobileMoneyProvider } from './mock.adapter';
import { MtnMobileMoneyProvider, mtnProviderFactory } from './mtn.adapter';

const noSleep = async () => {};

describeMobileMoneyContract('mock', () => {
  let now = 1_700_000_000_000;
  const provider = new MockMobileMoneyProvider({ now: () => now });
  return {
    provider,
    currency: 'XAF',
    phones: { success: MOCK_MOBILE_MONEY_NUMBERS.success, failure: MOCK_MOBILE_MONEY_NUMBERS.failure },
    settle: () => {
      now += 60_000;
    },
    httpCalls: () => 0,
    callbackFor: ({ providerRef, status }) => ({ headers: {}, body: { providerRef, status } }),
  };
});

describeMobileMoneyContract('MTN MoMo (faux serveur sandbox)', () => {
  const server = new FakeMtnServer();
  const provider = mtnProviderFactory.create(
    { environment: 'sandbox', credentials: { subscriptionKey: 'sub', apiUserId: 'user', apiKey: 'key' } },
    { http: server, sleep: noSleep },
  );
  return {
    provider,
    // Le sandbox MTN refuse le XAF et exige l'EUR (§1).
    currency: 'EUR',
    phones: { success: '+46733120001', failure: '+46733120002' },
    settle: () => server.settle(),
    httpCalls: () => server.calls.length,
    callbackFor: ({ reference, status }) => ({
      headers: {},
      body: { externalId: reference, status: status === 'succeeded' ? 'SUCCESSFUL' : 'FAILED', financialTransactionId: '1' },
    }),
  };
});

describeMobileMoneyContract('Airtel Money (faux serveur UAT)', () => {
  const server = new FakeAirtelServer();
  const provider = airtelProviderFactory.create(
    { environment: 'sandbox', credentials: { clientId: 'cid', clientSecret: 'secret' } },
    { http: server, sleep: noSleep },
  );
  return {
    provider,
    currency: 'XAF',
    phones: { success: '+242050000001', failure: '+242050000002' },
    settle: () => server.settle(),
    httpCalls: () => server.calls.length,
    callbackFor: ({ providerRef, status }) => ({
      headers: {},
      body: { transaction: { id: providerRef, status_code: status === 'succeeded' ? 'TS' : 'TF', message: '' } },
    }),
  };
});

describe('Opérateur factice — scénarios des numéros de test', () => {
  let now = 0;
  const provider = new MockMobileMoneyProvider({ now: () => now }, { slowDelayMs: 15_000, expireAfterMs: 30_000 });
  const pay = (payerPhone: string) => provider.requestPayment({ amount: 1000, currency: 'XAF', payerPhone, reference: `r-${payerPhone}-${now}` });

  it('slow : en attente puis réussi après le délai', async () => {
    const { providerRef } = await pay(MOCK_MOBILE_MONEY_NUMBERS.slow);
    now += 10_000;
    expect((await provider.getPaymentStatus(providerRef)).status).toBe('pending');
    now += 6_000;
    expect((await provider.getPaymentStatus(providerRef)).status).toBe('succeeded');
  });

  it('expire : en attente puis expiré', async () => {
    const { providerRef } = await pay(MOCK_MOBILE_MONEY_NUMBERS.expire);
    now += 31_000;
    expect(await provider.getPaymentStatus(providerRef)).toEqual({ status: 'expired', failureReason: 'EXPIRED' });
  });

  it('networkError : erreur réseau réessayable', async () => {
    await expect(pay(MOCK_MOBILE_MONEY_NUMBERS.networkError)).rejects.toMatchObject({ code: 'network', retryable: true });
  });

  it('inactive : titulaire inactif', async () => {
    expect(await provider.verifyAccountHolder(MOCK_MOBILE_MONEY_NUMBERS.inactive)).toEqual({ active: false });
  });

  it('le statut se lit depuis une autre instance (API et worker séparés)', async () => {
    const { providerRef } = await pay(MOCK_MOBILE_MONEY_NUMBERS.success);
    const other = new MockMobileMoneyProvider({ now: () => now });
    expect((await other.getPaymentStatus(providerRef)).status).toBe('succeeded');
  });
});

describe('Adaptateur MTN', () => {
  const credentials = { subscriptionKey: 'sub', apiUserId: 'user', apiKey: 'key' };

  it('met le jeton en cache (un seul appel de jeton pour plusieurs requêtes)', async () => {
    const server = new FakeMtnServer();
    const p = new MtnMobileMoneyProvider({ environment: 'sandbox', credentials }, { http: server, tokenCache: new MemoryTokenCache(), sleep: noSleep });
    const { providerRef } = await p.requestPayment({ amount: 150, currency: 'EUR', payerPhone: '+46733120001', reference: 'a' });
    await p.getPaymentStatus(providerRef);
    await p.getPaymentStatus(providerRef);
    expect(server.tokenCalls).toBe(1);
  });

  it('envoie le montant en unités majeures et l’externalId AlphaPay', async () => {
    const server = new FakeMtnServer();
    const p = mtnProviderFactory.create({ environment: 'sandbox', credentials }, { http: server, sleep: noSleep });
    await p.requestPayment({ amount: 150, currency: 'EUR', payerPhone: '+46733120001', reference: 'ref-42' });
    const call = server.calls.find((c) => c.url.endsWith('/requesttopay'))!;
    expect(call.body).toEqual(expect.objectContaining({ amount: '1.50', currency: 'EUR', externalId: 'ref-42' }));
    expect((call.body as any).payer.partyId).toBe('46733120001');
  });

  it('réessaie sur une erreur 503 puis réussit sans doublon', async () => {
    const server = new FakeMtnServer();
    const p = mtnProviderFactory.create({ environment: 'sandbox', credentials }, { http: server, sleep: noSleep });
    await p.requestPayment({ amount: 150, currency: 'EUR', payerPhone: '+46733120001', reference: 'warmup' });
    server.failNext.push(503);
    await p.requestPayment({ amount: 150, currency: 'EUR', payerPhone: '+46733120001', reference: 'retry-1' });
    expect(server.payments.size).toBe(2);
  });

  it('ne réessaie pas une erreur 400', async () => {
    const server = new FakeMtnServer();
    const p = mtnProviderFactory.create({ environment: 'sandbox', credentials }, { http: server, sleep: noSleep });
    await p.requestPayment({ amount: 150, currency: 'EUR', payerPhone: '+46733120001', reference: 'warmup' });
    server.failNext.push(400);
    await expect(p.requestPayment({ amount: 150, currency: 'EUR', payerPhone: '+46733120001', reference: 'bad' })).rejects.toMatchObject({
      code: 'invalid_request',
      retryable: false,
    });
  });

  it('utilise l’URL et l’environnement de production MTN Congo', async () => {
    const server = new FakeMtnServer();
    const p = mtnProviderFactory.create({ environment: 'production', credentials }, { http: server, sleep: noSleep });
    await p.requestPayment({ amount: 15000, currency: 'XAF', payerPhone: '+242060000001', reference: 'prod' });
    const call = server.calls.find((c) => c.url.endsWith('/requesttopay'))!;
    expect(call.url).toBe('https://proxy.momoapi.mtn.com/collection/v1_0/requesttopay');
    expect(call.headers!['X-Target-Environment']).toBe('mtncongo');
    expect((call.body as any).amount).toBe('15000');
  });

  it('verifyCredentials : identifiants refusés par MTN → auth_failed, sans réessai', async () => {
    const server = new FakeMtnServer();
    const p = mtnProviderFactory.create({ environment: 'sandbox', credentials: { ...credentials, apiKey: 'faux' } }, { http: server, sleep: noSleep });
    await expect(p.verifyCredentials()).rejects.toMatchObject({ code: 'auth_failed', retryable: false });
    expect(server.calls).toHaveLength(1);
  });

  it('verifyCredentials ignore le cache : une clé révoquée est détectée', async () => {
    const server = new FakeMtnServer();
    const cache = new MemoryTokenCache();
    const p = mtnProviderFactory.create({ environment: 'sandbox', credentials }, { http: server, tokenCache: cache, sleep: noSleep });
    await p.verifyCredentials();
    await p.verifyCredentials();
    expect(server.tokenCalls).toBe(2);
  });

  it('refuse une connexion sans identifiants complets', () => {
    expect(() => mtnProviderFactory.create({ environment: 'sandbox', credentials: { apiUserId: 'u' } })).toThrow(
      expect.objectContaining({ code: 'not_configured' }),
    );
  });

  it('mappe un échec MTN « EXPIRED » vers expired', async () => {
    const p = mtnProviderFactory.create({ environment: 'sandbox', credentials }, { http: new FakeMtnServer() });
    expect(p.parseCallback!({ headers: {}, body: { externalId: 'x', status: 'FAILED', reason: 'EXPIRED' } })).toEqual(
      expect.objectContaining({ status: 'expired' }),
    );
  });
});

describe('Adaptateur Airtel', () => {
  it('envoie le numéro national (sans 242) et refuse un numéro étranger', async () => {
    const server = new FakeAirtelServer();
    const p = new AirtelMobileMoneyProvider({ environment: 'sandbox', credentials: { clientId: 'cid', clientSecret: 'secret' } }, { http: server, sleep: noSleep });
    await p.requestPayment({ amount: 2500, currency: 'XAF', payerPhone: '+242050000001', reference: 'n1' });
    const call = server.calls.find((c) => c.url.endsWith('/merchant/v2/payments/'))!;
    expect((call.body as any).subscriber.msisdn).toBe('050000001');
    expect((call.body as any).transaction.amount).toBe(2500);
    await expect(p.requestPayment({ amount: 2500, currency: 'XAF', payerPhone: '+33612345678', reference: 'n2' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });
});
