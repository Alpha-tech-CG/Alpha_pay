import { BadRequestException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { ForbiddenException } from '@nestjs/common';
import { callbackToken, callbackUrl } from '../providers/callback-token';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: { handleWebhook: jest.Mock };
  let prisma: { providerConnection: { findFirst: jest.Mock } };

  beforeEach(() => {
    service = { handleWebhook: jest.fn().mockResolvedValue({ received: true }) };
    prisma = { providerConnection: { findFirst: jest.fn() } };
    controller = new WebhooksController(service as unknown as WebhooksService, prisma as any);
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

  describe('callback par URL à jeton (D-041)', () => {
    it('accepte le jeton de la connexion et limite au marchand de la connexion', async () => {
      prisma.providerConnection.findFirst.mockResolvedValue({ merchantId: 'm-1', operator: 'MTN' });
      await controller.handleConnectionCallback('mtn', 'conn-1', callbackToken('conn-1'), { externalId: 'tx' } as any);
      expect(service.handleWebhook).toHaveBeenCalledWith('MTN', { externalId: 'tx' }, undefined, 'm-1');
    });

    it('refuse un jeton faux ou celui d’une autre connexion', async () => {
      await expect(controller.handleConnectionCallback('mtn', 'conn-1', 'faux', {} as any)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(controller.handleConnectionCallback('mtn', 'conn-1', callbackToken('conn-2'), {} as any)).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.handleWebhook).not.toHaveBeenCalled();
    });

    it('refuse si l’opérateur de l’URL ne correspond pas à la connexion', async () => {
      prisma.providerConnection.findFirst.mockResolvedValue({ merchantId: 'm-1', operator: 'AIRTEL' });
      await expect(controller.handleConnectionCallback('mtn', 'conn-1', callbackToken('conn-1'), {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('construit l’URL de callback à partir de PUBLIC_API_URL', () => {
      process.env.PUBLIC_API_URL = 'https://api.alphapay.cg/';
      expect(callbackUrl('MTN', 'conn-1')).toBe(`https://api.alphapay.cg/webhooks/operators/mtn/conn-1/${callbackToken('conn-1')}`);
      delete process.env.PUBLIC_API_URL;
    });
  });
});
