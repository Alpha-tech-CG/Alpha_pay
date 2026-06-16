import { NotFoundException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: { handleWebhook: jest.Mock };
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MTN_WEBHOOK_SECRET: 'mtn-secret-test',
      AIRTEL_WEBHOOK_SECRET: 'airtel-secret-test',
    };
    service = { handleWebhook: jest.fn().mockResolvedValue({ received: true }) };
    controller = new WebhooksController(service as unknown as WebhooksService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects an MTN callback with the wrong secret', () => {
    expect(() => controller.handleMtn('wrong-secret', { status: 'SUCCESSFUL' } as any)).toThrow(
      NotFoundException,
    );
    expect(service.handleWebhook).not.toHaveBeenCalled();
  });

  it('rejects when no secret is configured server-side', () => {
    delete process.env.MTN_WEBHOOK_SECRET;
    expect(() => controller.handleMtn('', { status: 'SUCCESSFUL' } as any)).toThrow(NotFoundException);
  });

  it('accepts an MTN callback with the correct secret', () => {
    controller.handleMtn('mtn-secret-test', { status: 'SUCCESSFUL' } as any);
    expect(service.handleWebhook).toHaveBeenCalledWith('MTN', { status: 'SUCCESSFUL' });
  });

  it('rejects an Airtel callback with a secret from the wrong operator', () => {
    expect(() => controller.handleAirtel('mtn-secret-test', { status: 'SUCCESSFUL' } as any)).toThrow(
      NotFoundException,
    );
  });

  it('accepts an Airtel callback with the correct secret', () => {
    controller.handleAirtel('airtel-secret-test', { status: 'SUCCESSFUL' } as any);
    expect(service.handleWebhook).toHaveBeenCalledWith('AIRTEL', { status: 'SUCCESSFUL' });
  });
});
