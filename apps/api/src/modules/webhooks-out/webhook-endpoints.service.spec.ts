import { WebhookEndpointsService } from './webhook-endpoints.service';
import { ApiError } from '../../common/errors/api-error';

function createService() {
  const prisma = {
    webhookEndpoint: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ep1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ep1', ...data })),
      findUnique: jest.fn().mockResolvedValue({ id: 'ep1', merchantId: 'm1', livemode: false }),
    },
  };
  return { prisma, svc: new WebhookEndpointsService(prisma as any, {} as any) };
}

describe('WebhookEndpointsService : URL de webhook (anti-SSRF)', () => {
  const saved = process.env.WEBHOOKS_ALLOW_LOCALHOST;
  beforeEach(() => delete process.env.WEBHOOKS_ALLOW_LOCALHOST);
  afterAll(() => {
    if (saved === undefined) delete process.env.WEBHOOKS_ALLOW_LOCALHOST;
    else process.env.WEBHOOKS_ALLOW_LOCALHOST = saved;
  });

  it('accepte une URL publique en https (live)', async () => {
    const { svc, prisma } = createService();
    await svc.create('m1', true, { url: 'https://93.184.215.14/hook' });
    expect(prisma.webhookEndpoint.create).toHaveBeenCalled();
  });

  it.each([
    ['http en live', true, 'http://93.184.215.14/hook'],
    ['métadonnées cloud', true, 'https://169.254.169.254/latest/meta-data/'],
    ['IPv4 mappée en IPv6', true, 'https://[::ffff:127.0.0.1]/hook'],
    ['CGNAT', true, 'https://100.64.1.1/hook'],
    ['localhost en test (exception désactivée par défaut)', false, 'http://localhost:3000/hook'],
    ['réseau privé en test', false, 'http://10.0.0.5/hook'],
    ['IPv6 ULA en test', false, 'http://[fd00::1]/hook'],
  ])('refuse à la création : %s', async (_label, livemode, url) => {
    const { svc, prisma } = createService();
    const err = await svc.create('m1', livemode, { url }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.getStatus()).toBe(400);
    expect(prisma.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it('refuse aussi à la modification de l’URL', async () => {
    const { svc, prisma } = createService();
    await expect(svc.update('m1', false, 'ep1', { url: 'http://127.0.0.1:8080/' })).rejects.toBeInstanceOf(ApiError);
    expect(prisma.webhookEndpoint.update).not.toHaveBeenCalled();
  });

  it('accepte localhost en test avec WEBHOOKS_ALLOW_LOCALHOST=true, jamais en live', async () => {
    process.env.WEBHOOKS_ALLOW_LOCALHOST = 'true';
    const { svc, prisma } = createService();
    await svc.create('m1', false, { url: 'http://127.0.0.1:3000/hook' });
    expect(prisma.webhookEndpoint.create).toHaveBeenCalledTimes(1);
    await expect(svc.create('m1', true, { url: 'https://127.0.0.1/hook' })).rejects.toBeInstanceOf(ApiError);
  });
});
