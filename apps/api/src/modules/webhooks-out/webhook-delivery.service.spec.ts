import { WebhookDeliveryService } from './webhook-delivery.service';
import { encryptField } from '../../common/security/pii-crypto';

function createPrisma(endpoint: any) {
  return {
    webhookEndpoint: { findUnique: jest.fn().mockResolvedValue(endpoint) },
    webhookDelivery: { update: jest.fn().mockResolvedValue({}) },
  };
}

const ENDPOINT = { id: 'ep1', url: 'https://merchant.test/hook', secret: 'whsec_abc' };
const baseDelivery = { id: 'd1', endpointId: 'ep1', webhookId: 'wh1', event: 'payment.succeeded', payload: { a: 1 }, attempts: 0 };

describe('WebhookDeliveryService.attempt (ALP-132)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('signe le POST (X-Signature-256, X-Timestamp, X-Webhook-Id) et marque SUCCESS sur 2xx', async () => {
    const prisma = createPrisma(ENDPOINT);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    global.fetch = fetchMock as any;
    const svc = new WebhookDeliveryService(prisma as any, { send: jest.fn().mockResolvedValue({ ok: true }) } as any);

    const res = await svc.attempt({ ...baseDelivery });

    expect(res).toEqual({ ok: true, status: 200 });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers['X-Signature-256']).toMatch(/^sha256=[0-9a-f]+$/);
    expect(opts.headers['X-Timestamp']).toMatch(/^\d+$/);
    expect(opts.headers['X-Webhook-Id']).toBe('wh1');
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
  });

  it('reprogramme un retry sur échec (status PENDING, nextRetryAt futur)', async () => {
    const prisma = createPrisma(ENDPOINT);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as any;
    const svc = new WebhookDeliveryService(prisma as any, { send: jest.fn().mockResolvedValue({ ok: true }) } as any);

    await svc.attempt({ ...baseDelivery, attempts: 0 });

    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING');
    expect(data.attempts).toBe(1);
    expect(new Date(data.nextRetryAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('1er retry programmé à 30s (barème exact, pas d\'off-by-one)', async () => {
    const prisma = createPrisma(ENDPOINT);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as any;
    const svc = new WebhookDeliveryService(prisma as any, { send: jest.fn().mockResolvedValue({ ok: true }) } as any);

    const before = Date.now();
    await svc.attempt({ ...baseDelivery, attempts: 0 });
    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    const delayMs = new Date(data.nextRetryAt).getTime() - before;
    expect(delayMs).toBeGreaterThanOrEqual(29_000);
    expect(delayMs).toBeLessThanOrEqual(31_000);
  });

  it('marque FAILED une fois le barème épuisé (après le 6e délai)', async () => {
    const prisma = createPrisma({
      ...ENDPOINT,
      merchant: { id: 'm1', emailEncrypted: encryptField('ops@merchant.test') },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'down' }) as any;
    const notifications = { send: jest.fn().mockResolvedValue({ ok: true }) };
    const svc = new WebhookDeliveryService(prisma as any, notifications as any);

    await svc.attempt({ ...baseDelivery, attempts: 6 }); // 6 -> attempts 7, hors barème

    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('FAILED');
    expect(data.attempts).toBe(7);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ops@merchant.test' }));
  });

  it('gère un timeout réseau (fetch rejette) en reprogrammant', async () => {
    const prisma = createPrisma(ENDPOINT);
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })) as any;
    const svc = new WebhookDeliveryService(prisma as any, { send: jest.fn().mockResolvedValue({ ok: true }) } as any);

    await svc.attempt({ ...baseDelivery, attempts: 0 });

    const data = prisma.webhookDelivery.update.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING');
    expect(data.lastError).toBe('timeout');
  });
});
