import { UnauthorizedException } from '@nestjs/common';
import { SmileWebhookGuard } from './kyc-webhook.guard';

function context(signature?: string): any {
  return { switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-smile-signature': signature } }) }) };
}

describe('SmileWebhookGuard (ALP-142)', () => {
  const original = process.env.SMILE_WEBHOOK_SECRET;
  afterAll(() => { process.env.SMILE_WEBHOOK_SECRET = original; });

  it('accepte le secret partagé exact', () => {
    process.env.SMILE_WEBHOOK_SECRET = 'expected-secret';
    expect(new SmileWebhookGuard().canActivate(context('expected-secret'))).toBe(true);
  });

  it('rejette une signature absente ou différente', () => {
    process.env.SMILE_WEBHOOK_SECRET = 'expected-secret';
    expect(() => new SmileWebhookGuard().canActivate(context('wrong'))).toThrow(UnauthorizedException);
  });
});
