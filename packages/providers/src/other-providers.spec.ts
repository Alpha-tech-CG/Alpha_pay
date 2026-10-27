import { MockCardAcquirer } from './card/mock.adapter';
import { MockKycProvider } from './kyc/mock.adapter';
import { MockEmailProvider, MockOutbox, MockSmsProvider, MockWhatsAppProvider } from './messaging/mock.adapters';
import {
  describeCardContract,
  describeEmailContract,
  describeKycContract,
  describeSmsContract,
  describeWhatsAppContract,
} from './testing/other.contracts';

describeKycContract('mock', () => {
  const provider = new MockKycProvider({ webhookSecret: 'test-secret' });
  return { provider, complete: (id) => provider.signWebhook(provider.submit(id)) };
});

describeSmsContract('mock', () => ({ provider: new MockSmsProvider(), validTo: '+242060000001' }));
describeWhatsAppContract('mock', () => ({ provider: new MockWhatsAppProvider(), validTo: '+242060000001' }));
describeEmailContract('mock', () => ({ provider: new MockEmailProvider() }));

describeCardContract('mock', () => {
  const acquirer = new MockCardAcquirer({ webhookSecret: 'test-secret' });
  return { acquirer, complete: (id, outcome) => acquirer.complete(id, outcome) };
});

describe('KYC factice — règles de décision', () => {
  it.each([
    ['Mabiala', 'approved'],
    ['REJET', 'rejected'],
    ['Reprise', 'retry'],
  ])('nom %s → %s', async (lastName, decision) => {
    const p = new MockKycProvider({ webhookSecret: 's' });
    const { applicantId } = await p.createApplicant({ externalId: 'k', lastName });
    p.submit(applicantId);
    expect((await p.getResult(applicantId)).decision).toBe(decision);
  });
});

describe('Messages factices — boîte d’envoi partagée', () => {
  it('enregistre les envois de tous les canaux et simule l’échec d’une destination', async () => {
    const outbox = new MockOutbox();
    const wa = new MockWhatsAppProvider(outbox);
    const sms = new MockSmsProvider(outbox);
    outbox.failing.add('+242060000009');

    await expect(wa.sendTemplate({ to: '+242060000009', template: 'otp', language: 'fr', variables: ['1'] })).rejects.toMatchObject({
      code: 'rejected',
      retryable: false,
    });
    await sms.send({ to: '+242060000001', text: 'Bonjour' });
    expect(outbox.sent).toHaveLength(1);
    expect(outbox.last('sms')?.to).toBe('+242060000001');
  });

  it('une panne fournisseur est réessayable', async () => {
    const outbox = new MockOutbox();
    outbox.unavailable = true;
    await expect(new MockEmailProvider(outbox).send({ to: 'a@b.cg', subject: 's', text: 't' })).rejects.toMatchObject({ retryable: true });
  });
});

describe('Carte factice — expiration de session', () => {
  it('une session non payée expire', async () => {
    let now = 0;
    const acquirer = new MockCardAcquirer({ webhookSecret: 's', now: () => now, ttlSeconds: 60 });
    const s = await acquirer.createSession({ amount: 1000, currency: 'XAF', reference: 'r', returnUrl: 'https://a', cancelUrl: 'https://b' });
    now += 61_000;
    expect((await acquirer.getSessionStatus(s.sessionId)).status).toBe('expired');
  });
});
