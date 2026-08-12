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
    delete process.env.AIRTEL_WEBHOOK_IP_ALLOWLIST;
    delete process.env.REQUIRE_WEBHOOK_IP_ALLOWLIST;
    delete process.env.NODE_ENV;
    guard = new WebhookIpAllowlistGuard();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('allows callbacks with no allowlist in local development', () => {
    const { ctx } = makeContext('8.8.8.8');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks callbacks in production when no allowlist is configured', () => {
    process.env.NODE_ENV = 'production';
    const { ctx, res } = makeContext('8.8.8.8');
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.ended).toBe(true);
  });

  it('blocks callbacks when allowlist is explicitly required', () => {
    process.env.REQUIRE_WEBHOOK_IP_ALLOWLIST = 'true';
    const { ctx, res } = makeContext('8.8.8.8');
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.ended).toBe(true);
  });

  it('allows an IP in the configured CIDR block', () => {
    process.env.MTN_WEBHOOK_IP_ALLOWLIST = '41.202.1.0/24';
    const { ctx } = makeContext('41.202.1.42');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks an IP outside the allowlist with an empty 403 response', () => {
    process.env.MTN_WEBHOOK_IP_ALLOWLIST = '41.202.1.0/24';
    const { ctx, res } = makeContext('8.8.8.8');
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.ended).toBe(true);
  });

  it('uses the Airtel allowlist for Airtel callbacks', () => {
    process.env.AIRTEL_WEBHOOK_IP_ALLOWLIST = '197.149.0.0/16';
    const { ctx } = makeContext('197.149.5.5', 'airtel');
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
