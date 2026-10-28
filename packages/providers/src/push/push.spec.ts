import { ProviderError } from '../core/errors';
import { MockWebPushProvider } from './mock.adapter';
import { VapidWebPushProvider } from './web-push.adapter';

const sub = { endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' };
const payload = { title: 'Paiement reçu', body: '15 000 XAF' };
const config = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:support@alphapay.cg' };

describe('VapidWebPushProvider', () => {
  it('envoie la notification chiffrée avec VAPID, TTL et urgence haute', async () => {
    const client = { sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }) };
    await new VapidWebPushProvider(config, client as any).send(sub, payload, { ttlSeconds: 60 });
    expect(client.sendNotification).toHaveBeenCalledWith(
      { endpoint: sub.endpoint, keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify(payload),
      expect.objectContaining({ TTL: 60, urgency: 'high', vapidDetails: { subject: config.subject, publicKey: 'pub', privateKey: 'priv' } }),
    );
  });

  it.each([
    [410, 'not_found', false],
    [404, 'not_found', false],
    [429, 'rate_limited', true],
    [503, 'unavailable', true],
    [400, 'rejected', false],
  ])('HTTP %i → %s (réessayable : %s)', async (statusCode, code, retryable) => {
    const client = { sendNotification: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { statusCode })) };
    const err = await new VapidWebPushProvider(config, client as any).send(sub, payload).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code, retryable });
  });

  it('génère des clés VAPID valides', () => {
    const keys = VapidWebPushProvider.generateKeys();
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(keys.privateKey).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });
});

describe('MockWebPushProvider', () => {
  it('enregistre les envois et simule un abonnement expiré', async () => {
    const mock = new MockWebPushProvider();
    await mock.send(sub, payload);
    expect(mock.sent).toHaveLength(1);
    mock.expired.add(sub.endpoint);
    await expect(mock.send(sub, payload)).rejects.toMatchObject({ code: 'not_found' });
  });
});
