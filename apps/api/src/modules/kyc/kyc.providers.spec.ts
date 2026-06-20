import { ServiceUnavailableException } from '@nestjs/common';
import { KycProviderService } from './kyc.providers';

describe('KycProviderService (ALP-142)', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original }; jest.restoreAllMocks(); });
  afterAll(() => { process.env = original; });

  it('refuse tout stub Smile quand les identifiants manquent', async () => {
    delete process.env.SMILE_API_URL;
    delete process.env.SMILE_PARTNER_ID;
    delete process.env.SMILE_API_KEY;
    const provider = new KycProviderService();
    await expect(provider.startSmileVerification('m1', [])).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('lance un job Document + Biometric avec callback', async () => {
    Object.assign(process.env, { SMILE_API_URL: 'https://smile.test', SMILE_PARTNER_ID: 'p1', SMILE_API_KEY: 'secret', SMILE_CALLBACK_URL: 'https://api.test/webhooks/kyc/smile' });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ jobId: 'job-1' }) } as Response);
    const provider = new KycProviderService();
    await expect(provider.startSmileVerification('m1', ['doc-1'])).resolves.toEqual({ jobId: 'job-1' });
    expect(fetchMock).toHaveBeenCalledWith('https://smile.test/jobs', expect.objectContaining({ method: 'POST' }));
  });

  it('screen OFAC, UE, ONU et PEP via le fournisseur configuré', async () => {
    Object.assign(process.env, { SANCTIONS_API_URL: 'https://screen.test', SANCTIONS_API_TOKEN: 'token' });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ hit: true, lists: ['OFAC'] }) } as Response);
    const provider = new KycProviderService();
    await expect(provider.screenSanctions('Example Name')).resolves.toEqual({ hit: true, lists: ['OFAC'] });
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).sources).toEqual(['OFAC', 'EU', 'UN', 'PEP']);
  });
});
