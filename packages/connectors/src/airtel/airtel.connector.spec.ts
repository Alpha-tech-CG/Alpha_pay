import axios from 'axios';
import { AirtelConnector } from './airtel.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function connector(extra: Partial<ConstructorParameters<typeof AirtelConnector>[0]> = {}) {
  return new AirtelConnector({
    clientId: 'cid',
    clientSecret: 'secret',
    baseUrl: 'https://openapiuat.airtel.africa',
    environment: 'sandbox',
    webhookUrl: 'https://example.com/webhooks',
    ...extra,
  });
}

const TOKEN_RES = { data: { access_token: 'tok-123', expires_in: 3600 } };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AirtelConnector', () => {
  it('requestToPay : authentifie, appelle /merchant/v2/payments et renvoie PENDING/AIRTEL', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(TOKEN_RES) // token
      .mockResolvedValueOnce({ data: {} }); // payment

    const res = await connector().requestToPay({
      amount: 2500, currency: 'XAF', phone: '242055123456', externalId: 'cmd-1', description: 'Test',
    } as any);

    expect(res).toMatchObject({ status: 'PENDING', operator: 'AIRTEL' });
    expect(typeof res.referenceId).toBe('string');

    const [url, body, cfg] = mockedAxios.post.mock.calls[1] as [string, any, any];
    expect(url).toContain('/merchant/v2/payments');
    expect(body).toMatchObject({
      reference: 'cmd-1',
      subscriber: { country: 'CG', currency: 'XAF', msisdn: '242055123456' },
      transaction: { amount: 2500, country: 'CG', currency: 'XAF' },
    });
    expect(cfg.headers.Authorization).toBe('Bearer tok-123');
  });

  it('réutilise le token en cache (pas de 2e appel /auth) sur deux paiements', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(TOKEN_RES)
      .mockResolvedValue({ data: {} });
    const c = connector();
    await c.requestToPay({ amount: 1, currency: 'XAF', phone: '242055000000', externalId: 'a' } as any);
    await c.requestToPay({ amount: 1, currency: 'XAF', phone: '242055000000', externalId: 'b' } as any);
    const authCalls = mockedAxios.post.mock.calls.filter(([u]) => String(u).includes('/auth/oauth2/token'));
    expect(authCalls).toHaveLength(1);
  });

  it.each([
    ['TS', 'SUCCESSFUL'],
    ['TF', 'FAILED'],
    ['TIP', 'PENDING'],
  ])('getStatus mappe %s -> %s', async (airtelStatus, expected) => {
    mockedAxios.post.mockResolvedValueOnce(TOKEN_RES);
    mockedAxios.get.mockResolvedValueOnce({ data: { data: { transaction: { status: airtelStatus } } } });
    const status = await connector().getStatus('ref-1');
    expect(status).toBe(expected);
  });

  it('disburse : refuse sans PIN configuré', async () => {
    await expect(
      connector().disburse({ amount: 1000, currency: 'XAF', phone: '242055123456', externalId: 'STL-1' } as any),
    ).rejects.toThrow(/disbursement/i);
  });

  it('disburse : appelle /standard/v1/disbursements avec PIN et renvoie PENDING/AIRTEL', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(TOKEN_RES)
      .mockResolvedValueOnce({ data: {} });
    const res = await connector({ disbursementPin: 'ENC_PIN' }).disburse({
      amount: 1000, currency: 'XAF', phone: '242055123456', externalId: 'STL-1',
    } as any);
    expect(res).toMatchObject({ status: 'PENDING', operator: 'AIRTEL' });
    const [url, body] = mockedAxios.post.mock.calls[1] as [string, any, any];
    expect(url).toContain('/standard/v1/disbursements');
    expect(body).toMatchObject({ payee: { msisdn: '242055123456' }, reference: 'STL-1', pin: 'ENC_PIN' });
    expect(body.transaction.amount).toBe(1000);
  });
});
