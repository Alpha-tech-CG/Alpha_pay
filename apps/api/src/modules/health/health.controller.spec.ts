import { HealthController } from './health.controller';

describe('HealthController', () => {
  const env = process.env;
  const res = () => ({ status: jest.fn() }) as any;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.REDIS_URL;
  });
  afterAll(() => {
    process.env = env;
  });

  it('/health répond ok sans dépendance', () => {
    expect(new HealthController({} as any).health()).toEqual({ status: 'ok' });
  });

  it('/ready : 200 quand la base répond (Redis non configuré en dev)', async () => {
    const r = res();
    const body = await new HealthController({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any).ready(r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(body).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'non_configure' } });
  });

  it('/ready : 503 quand la base est injoignable', async () => {
    const r = res();
    const body = await new HealthController({ $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) } as any).ready(r);
    expect(r.status).toHaveBeenCalledWith(503);
    expect(body.checks.database).toBe('ko');
  });

  it('/ready : 503 quand Redis est configuré mais injoignable', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const r = res();
    const c = new HealthController({ $queryRaw: jest.fn().mockResolvedValue([]) } as any);
    const body = await c.ready(r);
    await c.onModuleDestroy();
    expect(r.status).toHaveBeenCalledWith(503);
    expect(body.checks.redis).toBe('ko');
  });
});
