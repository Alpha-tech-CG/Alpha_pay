import { RETRY_SCHEDULE_SEC, WebhookDeliveryService } from './webhook-delivery.service';
import { verifyAlphaPaySignature } from '../../common/security/hmac';
import { encryptField } from '../../common/security/pii-crypto';
import { postWebhook, WebhookUrlRejectedError } from '../../common/security/webhook-url-guard';

// Transport HTTP simulé ; le garde anti-SSRF lui-même est testé dans
// webhook-url-guard.spec.ts.
jest.mock('../../common/security/webhook-url-guard', () => ({
  ...jest.requireActual('../../common/security/webhook-url-guard'),
  postWebhook: jest.fn(),
}));
const postMock = postWebhook as jest.MockedFunction<typeof postWebhook>;

function createPrisma(endpoint: any) {
  return {
    webhookEndpoint: { findUnique: jest.fn().mockResolvedValue(endpoint) },
    webhookDelivery: { update: jest.fn().mockResolvedValue({}) },
  };
}

const ENDPOINT = { id: 'ep1', url: 'https://merchant.test/hook', secret: 'whsec_abc', livemode: true };
const baseDelivery = { id: 'd1', endpointId: 'ep1', webhookId: 'wh1', event: 'payment.succeeded', payload: { a: 1 }, attempts: 0 };

describe('WebhookDeliveryService.attempt (ALP-132)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    postMock.mockReset();
  });

  it('signe le POST (AlphaPay-Signature t=…,v1=…) et marque SUCCESS sur 2xx', async () => {
    const prisma = createPrisma(ENDPOINT);
    postMock.mockResolvedValue({ status: 200, body: 'ok' });
    const svc = new WebhookDeliveryService(prisma as any, { send: jest.fn().mockResolvedValue({ ok: true }) } as any);

    const res = await svc.attempt({ ...baseDelivery });

    expect(res).toEqual({ ok: true, status: 200 });
    const [url, opts] = postMock.mock.calls[0];
    expect(url).toBe(ENDPOINT.url);
    expect(opts.livemode).toBe(true);
    expect(opts.headers['AlphaPay-Signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(opts.headers['AlphaPay-Delivery-Id']).toBe('wh1');
    // La signature se vérifie avec le secret de l'endpoint (exemple documenté).
    expect(verifyAlphaPaySignature(ENDPOINT.secret, opts.headers['AlphaPay-Signature'], opts.body)).toBe(true);
    expect(verifyAlphaPaySignature('autre-secret', opts.headers['AlphaPay-Signature'], opts.body)).toBe(false);
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
  });

  it('reprogramme un retry sur échec (status PENDING, nextRetryAt futur)', async () => {
    const prisma = createPrisma(ENDPOINT);
    postMock.mockResolvedValue({ status: 500, body: 'boom' });
    const svc = new WebhookDeliveryService(prisma as any, { send: jest.fn().mockResolvedValue({ ok: true }) } as any);

    await svc.attempt({ ...baseDelivery, attempts: 0 });

    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING');
    expect(data.attempts).toBe(1);
    expect(new Date(data.nextRetryAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('1er retry programmé à 30s (barème exact, pas d\'off-by-one)', async () => {
    const prisma = createPrisma(ENDPOINT);
    postMock.mockResolvedValue({ status: 500, body: 'boom' });
    const svc = new WebhookDeliveryService(prisma as any, { send: jest.fn().mockResolvedValue({ ok: true }) } as any);

    const before = Date.now();
    await svc.attempt({ ...baseDelivery, attempts: 0 });
    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    const delayMs = new Date(data.nextRetryAt).getTime() - before;
    expect(delayMs).toBeGreaterThanOrEqual(59_000);
    expect(delayMs).toBeLessThanOrEqual(61_000);
  });

  it('marque FAILED une fois le barème épuisé (après le 6e délai)', async () => {
    const prisma = createPrisma({
      ...ENDPOINT,
      merchant: { id: 'm1', emailEncrypted: encryptField('ops@merchant.test') },
    });
    postMock.mockResolvedValue({ status: 503, body: 'down' });
    const messaging = { send: jest.fn().mockResolvedValue({ id: 'msg-1' }) };
    const svc = new WebhookDeliveryService(prisma as any, { get: () => messaging } as any);

    await svc.attempt({ ...baseDelivery, attempts: 6 }); // 6 -> attempts 7, hors barème

    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('FAILED');
    expect(data.attempts).toBe(7);
    expect(messaging.send).toHaveBeenCalledWith(expect.objectContaining({ to: { email: 'ops@merchant.test' }, channels: ['EMAIL'] }));
  });

  it('gère un timeout réseau (envoi rejeté) en reprogrammant', async () => {
    const prisma = createPrisma(ENDPOINT);
    postMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const svc = new WebhookDeliveryService(prisma as any, { send: jest.fn().mockResolvedValue({ ok: true }) } as any);

    await svc.attempt({ ...baseDelivery, attempts: 0 });

    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING');
    expect(data.lastError).toBe('timeout');
  });

  it('une redirection est un échec, jamais suivie', async () => {
    const prisma = createPrisma(ENDPOINT);
    postMock.mockResolvedValue({ status: 302, body: '' });
    const svc = new WebhookDeliveryService(prisma as any, {} as any);

    const res = await svc.attempt({ ...baseDelivery, attempts: 0 });

    expect(res).toEqual({ ok: false, status: 302 });
    expect(postMock).toHaveBeenCalledTimes(1);
    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING');
    expect(data.lastError).toBe('redirection refusée (HTTP 302)');
  });

  it('destination non publique (revalidée à l’envoi) : échec sans statut HTTP', async () => {
    const prisma = createPrisma({ ...ENDPOINT, url: 'https://rebind.example/hook' });
    postMock.mockRejectedValue(new WebhookUrlRejectedError('Adresse de destination non publique'));
    const svc = new WebhookDeliveryService(prisma as any, {} as any);

    const res = await svc.attempt({ ...baseDelivery, attempts: 0 });

    expect(res).toEqual({ ok: false, status: 0 });
    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.lastError).toBe('destination refusée : Adresse de destination non publique');
    expect(data.responseStatus).toBeUndefined();
  });

  it('ne renvoie pas au marchand le détail d’une erreur réseau (adresse, port)', async () => {
    const prisma = createPrisma(ENDPOINT);
    postMock.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 203.0.113.9:8443'), { code: 'ECONNREFUSED' }));
    const svc = new WebhookDeliveryService(prisma as any, {} as any);

    await svc.attempt({ ...baseDelivery, attempts: 0 });

    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.lastError).toBe('erreur réseau (ECONNREFUSED)');
  });
});
