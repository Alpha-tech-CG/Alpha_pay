import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletCallbacksController } from './wallet-callbacks.controller';

function makeController(env: Record<string, string | undefined> = {}) {
  const wallet = {
    confirmCashIn: jest.fn().mockResolvedValue({ ok: true }),
    confirmCashOut: jest.fn().mockResolvedValue({ ok: true }),
  };
  const config = {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
  const controller = new WalletCallbacksController(wallet as any, config);
  const req: any = { rawBody: Buffer.from('{"referenceId":"ref1","status":"SUCCESSFUL"}') };
  return { controller, wallet, req };
}

describe('WalletCallbacksController security', () => {
  it('rejects unsigned MTN callbacks when the webhook secret is missing', async () => {
    const { controller, wallet, req } = makeController({ NODE_ENV: 'development' });

    await expect(
      controller.mtnCallback('cash-in', { referenceId: 'ref1', status: 'SUCCESSFUL' }, undefined, req),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(wallet.confirmCashIn).not.toHaveBeenCalled();
  });

  it('allows unsigned callbacks only with the explicit sandbox override', async () => {
    const { controller, wallet, req } = makeController({
      NODE_ENV: 'development',
      ALLOW_UNSIGNED_OPERATOR_CALLBACKS: 'true',
    });

    await expect(
      controller.mtnCallback('cash-in', { referenceId: 'ref1', status: 'SUCCESSFUL' }, undefined, req),
    ).resolves.toEqual({ ok: true });
    expect(wallet.confirmCashIn).toHaveBeenCalledWith('ref1', 'SUCCESSFUL');
  });

  it('never allows unsigned callbacks in production', async () => {
    const { controller, req } = makeController({
      NODE_ENV: 'production',
      ALLOW_UNSIGNED_OPERATOR_CALLBACKS: 'true',
    });

    await expect(
      controller.airtelCallback('cash-out', { transaction: { id: 'ref1', status_code: 'TS' } }, undefined, req),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
