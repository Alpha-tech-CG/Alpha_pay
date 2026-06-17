import { ExecutionContext } from '@nestjs/common';
import { WebhookIpAllowlistGuard } from './webhook-ip-allowlist.guard';

function makeContext(ip: string, operator = 'mtn') {
  const res = {
    statusCode: 0,
    ended: false,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  const req: any = { params: { operator }, ip, socket: { remoteAddress: ip } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, res };
}

describe('WebhookIpAllowlistGuard (ALP-160)', () => {
  let guard: WebhookIpAllowlistGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MTN_WEBHOOK_IP_ALLOWLIST;
    guard = new WebhookIpAllowlistGuard();
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('no-op (autorise) si aucune allowlist configurée', () => {
    const { ctx } = makeContext('8.8.8.8');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('autorise une IP dans le bloc CIDR configuré', () => {
    process.env.MTN_WEBHOOK_IP_ALLOWLIST = '41.202.1.0/24';
    const { ctx } = makeContext('41.202.1.42');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('bloque une IP hors allowlist avec un 403 corps vide', () => {
    process.env.MTN_WEBHOOK_IP_ALLOWLIST = '41.202.1.0/24';
    const { ctx, res } = makeContext('8.8.8.8');
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.ended).toBe(true);
  });

  it('utilise l\'allowlist Airtel pour un callback Airtel', () => {
    process.env.AIRTEL_WEBHOOK_IP_ALLOWLIST = '197.149.0.0/16';
    const { ctx } = makeContext('197.149.5.5', 'airtel');
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
