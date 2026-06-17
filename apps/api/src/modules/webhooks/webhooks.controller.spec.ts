import { BadRequestException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: { handleWebhook: jest.Mock };

  beforeEach(() => {
    service = { handleWebhook: jest.fn().mockResolvedValue({ received: true }) };
    controller = new WebhooksController(service as unknown as WebhooksService);
  });

  it('route un callback MTN vers le service', async () => {
    await controller.handle('mtn', { status: 'SUCCESSFUL' } as any);
    expect(service.handleWebhook).toHaveBeenCalledWith('MTN', { status: 'SUCCESSFUL' });
  });

  it('route un callback Airtel vers le service (casse insensible)', async () => {
    await controller.handle('AIRTEL', { status: 'SUCCESSFUL' } as any);
    expect(service.handleWebhook).toHaveBeenCalledWith('AIRTEL', { status: 'SUCCESSFUL' });
  });

  it('rejette un opérateur inconnu', async () => {
    await expect(controller.handle('paypal', { status: 'SUCCESSFUL' } as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(service.handleWebhook).not.toHaveBeenCalled();
  });
});
