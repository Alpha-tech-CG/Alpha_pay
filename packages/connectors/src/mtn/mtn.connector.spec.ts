import axios from 'axios';
import { MtnConnector } from './mtn.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function connector(extra: Partial<ConstructorParameters<typeof MtnConnector>[0]> = {}) {
  return new MtnConnector({
    subscriptionKey: 'sub',
    apiUserId: 'user',
    apiKey: 'key',
    baseUrl: 'https://sandbox.momodeveloper.mtn.com',
    environment: 'sandbox',
    currency: 'EUR',
    webhookUrl: 'https://example.com/webhooks',
    ...extra,
  });
}

const TOKEN_RES = { data: { access_token: 'tok', expires_in: 3600 } };

beforeEach(() => jest.clearAllMocks());

describe('MtnConnector', () => {
  it('requestToPay : POST /collection/v1_0/requesttopay -> PENDING/MTN', async () => {
    mockedAxios.post.mockResolvedValueOnce(TOKEN_RES).mockResolvedValueOnce({ data: {} });
    const res = await connector().requestToPay({
      amount: 1500, currency: 'EUR', phone: '242066123456', externalId: 'cmd-1',
    } as any);
    expect(res).toMatchObject({ status: 'PENDING', operator: 'MTN' });
    const [url] = mockedAxios.post.mock.calls[1] as [string, any, any];
    expect(url).toContain('/collection/v1_0/requesttopay');
  });

  it('disburse : refuse sans clé d’abonnement Disbursement', async () => {
    await expect(
      connector().disburse({ amount: 1000, currency: 'EUR', phone: '242066123456', externalId: 'STL-1' } as any),
    ).rejects.toThrow(/MTN_DISBURSEMENT_SUBSCRIPTION_KEY/);
  });

  it('disburse : token via /disbursement/token + POST /disbursement/v1_0/transfer', async () => {
    mockedAxios.post.mockResolvedValueOnce(TOKEN_RES).mockResolvedValueOnce({ data: {} });
    const res = await connector({ disbursementSubscriptionKey: 'disb-sub' }).disburse({
      amount: 2000, currency: 'EUR', phone: '242066123456', externalId: 'STL-2',
    } as any);
    expect(res).toMatchObject({ status: 'PENDING', operator: 'MTN' });
    const [tokenUrl] = mockedAxios.post.mock.calls[0] as [string, any, any];
    const [transferUrl, body] = mockedAxios.post.mock.calls[1] as [string, any, any];
    expect(tokenUrl).toContain('/disbursement/token/');
    expect(transferUrl).toContain('/disbursement/v1_0/transfer');
    expect(body).toMatchObject({ externalId: 'STL-2', payee: { partyIdType: 'MSISDN', partyId: '242066123456' } });
  });
});
