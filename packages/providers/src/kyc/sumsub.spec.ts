import { describeKycContract } from '../testing/other.contracts';
import { FakeSumsub } from '../testing/fake-sumsub';
import { SumsubKycProvider } from './sumsub.adapter';

const cfg = { appToken: 'tok', secretKey: 'sk', webhookSecret: 'whs', levelName: 'dirigeant' };

describeKycContract('sumsub', () => {
  const fake = new FakeSumsub(cfg);
  const provider = new SumsubKycProvider(cfg, { http: fake });
  return { provider, complete: (id) => fake.complete(id) };
});

describe('SumsubKycProvider', () => {
  it('signe chaque requête ; une mauvaise clé est refusée (auth_failed)', async () => {
    const provider = new SumsubKycProvider({ ...cfg, secretKey: 'faux' }, { http: new FakeSumsub(cfg) });
    await expect(provider.createApplicant({ externalId: 'k' })).rejects.toMatchObject({ code: 'auth_failed' });
  });

  it('traduit les décisions : vert → approuvé, rouge définitif → refusé avec motifs', async () => {
    const fake = new FakeSumsub(cfg);
    const provider = new SumsubKycProvider(cfg, { http: fake });
    const ok = await provider.createApplicant({ externalId: 'a', lastName: 'Mabiala' });
    const ko = await provider.createApplicant({ externalId: 'b', lastName: 'REJET' });
    fake.complete(ok.applicantId);
    fake.complete(ko.applicantId);
    expect(await provider.getResult(ok.applicantId)).toEqual({ decision: 'approved' });
    expect(await provider.getResult(ko.applicantId)).toEqual({ decision: 'rejected', reasons: ['FORGERY'] });
  });
});
