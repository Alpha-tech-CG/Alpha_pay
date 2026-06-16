import { WebhooksService } from './webhooks.service';
import { WebhooksGateway } from './webhooks.gateway';

jest.mock('@paybrain/connectors', () => ({
  createMtnConnector: jest.fn(),
  createAirtelConnector: jest.fn(),
}));

import { createMtnConnector, createAirtelConnector } from '@paybrain/connectors';

describe('WebhooksService', () => {
  let prisma: any;
  let gateway: { broadcast: jest.Mock };
  let mtnGetStatus: jest.Mock;
  let airtelGetStatus: jest.Mock;
  let service: WebhooksService;

  beforeEach(() => {
    prisma = {
      transaction: { findFirst: jest.fn(), update: jest.fn() },
      webhookLog: { create: jest.fn() },
    };
    gateway = { broadcast: jest.fn() };
    mtnGetStatus = jest.fn();
    airtelGetStatus = jest.fn();
    (createMtnConnector as jest.Mock).mockReturnValue({ getStatus: mtnGetStatus });
    (createAirtelConnector as jest.Mock).mockReturnValue({ getStatus: airtelGetStatus });

    service = new WebhooksService(prisma, gateway as unknown as WebhooksGateway);
  });

  it('ignores a callback for a transaction it does not know about', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    const result = await service.handleWebhook('MTN', {
      financialTransactionId: 'unknown-ref',
      status: 'SUCCESSFUL',
    } as any);

    expect(result).toEqual({ received: true });
    expect(prisma.webhookLog.create).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(mtnGetStatus).not.toHaveBeenCalled();
  });

  it('never trusts the status in the payload: it re-verifies with the operator', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      mtnReferenceId: 'ref-1',
      externalId: 'ext-1',
      status: 'PENDING',
    });
    mtnGetStatus.mockResolvedValue('FAILED');

    await service.handleWebhook('MTN', {
      financialTransactionId: 'ref-1',
      status: 'SUCCESSFUL', // payload lies, real status (mocked) says FAILED
    } as any);

    expect(mtnGetStatus).toHaveBeenCalledWith('ref-1');
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { status: 'FAILED', failureReason: undefined },
    });
    expect(gateway.broadcast).toHaveBeenCalledWith('transaction_update', {
      externalId: 'ext-1',
      status: 'FAILED',
      reason: undefined,
    });
  });

  it('does not update a transaction already in a terminal state (idempotency)', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-2',
      mtnReferenceId: 'ref-2',
      externalId: 'ext-2',
      status: 'SUCCESSFUL',
    });

    await service.handleWebhook('MTN', {
      financialTransactionId: 'ref-2',
      status: 'FAILED',
    } as any);

    expect(mtnGetStatus).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('does nothing if the operator still reports PENDING', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-3',
      mtnReferenceId: 'ref-3',
      externalId: 'ext-3',
      status: 'PENDING',
    });
    mtnGetStatus.mockResolvedValue('PENDING');

    await service.handleWebhook('MTN', {
      financialTransactionId: 'ref-3',
      status: 'SUCCESSFUL',
    } as any);

    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(gateway.broadcast).not.toHaveBeenCalled();
  });

  it('routes AIRTEL callbacks to the Airtel connector, not MTN', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-4',
      mtnReferenceId: 'ref-4',
      externalId: 'ext-4',
      status: 'PENDING',
    });
    airtelGetStatus.mockResolvedValue('SUCCESSFUL');

    await service.handleWebhook('AIRTEL', {
      financialTransactionId: 'ref-4',
      status: 'SUCCESSFUL',
    } as any);

    expect(airtelGetStatus).toHaveBeenCalledWith('ref-4');
    expect(mtnGetStatus).not.toHaveBeenCalled();
  });
});
