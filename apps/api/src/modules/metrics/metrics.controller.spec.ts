import { UnauthorizedException } from '@nestjs/common';
import { MetricsController } from './metrics.controller';

function makeController() {
  const metrics = {
    contentType: jest.fn(() => 'text/plain; version=0.0.4'),
    getMetrics: jest.fn(async () => 'paybrain_metric 1\n'),
  };
  const controller = new MetricsController(metrics as any);
  const req: any = {
    headers: {},
    res: { setHeader: jest.fn() },
  };
  return { controller, req };
}

describe('MetricsController security', () => {
  const oldEnv = process.env;

  beforeEach(() => {
    process.env = { ...oldEnv };
    delete process.env.METRICS_TOKEN;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  it('rejects metrics scraping in production when METRICS_TOKEN is missing', async () => {
    const { controller, req } = makeController();
    process.env.NODE_ENV = 'production';

    await expect(controller.scrape(req)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires the configured bearer token', async () => {
    const { controller, req } = makeController();
    process.env.METRICS_TOKEN = 'metrics-secret';

    await expect(controller.scrape(req)).rejects.toBeInstanceOf(UnauthorizedException);

    req.headers.authorization = 'Bearer metrics-secret';
    await expect(controller.scrape(req)).resolves.toBe('paybrain_metric 1\n');
  });
});
