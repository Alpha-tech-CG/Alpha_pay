import { ExecutionContext } from '@nestjs/common';
import { WebhookHmacGuard } from './webhook-hmac.guard';
import { signWebhookPayload } from '../../../common/security/hmac';

const SECRET = 'mtn-webhook-secret-test';

function makeContext(headers: Record<string, string>, rawBody: Buffer | undefined, operator = 'mtn') {
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
  const req: any = { params: { operator }, headers, rawBody };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, res, req };
}

describe('WebhookHmacGuard (ALP-158 + ALP-159)', () => {
  let guard: WebhookHmacGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, MTN_WEBHOOK_SECRET: SECRET };
    guard = new WebhookHmacGuard();
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepte une signature valide', () => {
    const body = Buffer.from('{"status":"SUCCESSFUL"}');
    const ts = Math.floor(Date.now() / 1000);
    const { ctx } = makeContext(
      { 'x-timestamp': String(ts), 'x-signature-256': signWebhookPayload(SECRET, ts, body) },
      body,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('refuse une signature absente avec un 401 à corps vide', () => {
    const { ctx, res } = makeContext({}, Buffer.from('{}'));
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.ended).toBe(true);
  });

  it('refuse une signature invalide (401 vide)', () => {
    const ts = Math.floor(Date.now() / 1000);
    const { ctx, res } = makeContext(
      { 'x-timestamp': String(ts), 'x-signature-256': 'sha256=' + 'a'.repeat(64) },
      Buffer.from('{}'),
    );
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('refuse si le secret n\'est pas configuré', () => {
    delete process.env.MTN_WEBHOOK_SECRET;
    const { ctx, res } = makeContext({}, Buffer.from('{}'));
    expect(guard.canActivate(ctx)).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
