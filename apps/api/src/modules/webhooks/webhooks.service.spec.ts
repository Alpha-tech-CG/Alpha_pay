import { WebhooksService } from './webhooks.service';
import { WebhooksGateway } from './webhooks.gateway';

describe('WebhooksService', () => {
  let verif: { onPaymentSucceeded: jest.Mock };
  let prisma: any;
  let gateway: { broadcastToMerchant: jest.Mock };
  let fetchProviderStatus: jest.Mock;
  let service: WebhooksService;

  beforeEach(() => {
    prisma = {
      transaction: { findFirst: jest.fn(), update: jest.fn() },
      paymentLink: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      webhookLog: { create: jest.fn() },
      webhookInboundEvent: { create: jest.fn().mockResolvedValue({}) },
      // Simule transitionStatus (ALP-167) : exécute le callback avec un tx mock.
      $transaction: jest.fn(async (cb: any) => {
        const tx = {
          $queryRaw: jest.fn(async () => {
            const t = await prisma.transaction.findFirst();
            return [{ id: t.id, status: t.status, version: 0 }];
          }),
          transaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          transactionAudit: { create: jest.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      }),
    };
    gateway = { broadcastToMerchant: jest.fn() };
    fetchProviderStatus = jest.fn();

    const webhookDelivery = { dispatch: jest.fn().mockResolvedValue(0) };
    verif = { onPaymentSucceeded: jest.fn().mockResolvedValue(undefined) };
    service = new WebhooksService(
      prisma,
      gateway as unknown as WebhooksGateway,
      webhookDelivery as any,
      { fetchProviderStatus } as any,
      verif as any,
    );
  });

  it('ignores a callback for a transaction it does not know about', async () => {
    prisma.transaction.findFirst.mockResolvedValue(null);

    const result = await service.handleWebhook('MTN', {
      financialTransactionId: 'unknown-ref',
      externalId: 'unknown-tx',
      status: 'SUCCESSFUL',
    } as any);

    expect(result).toEqual({ received: true });
    expect(prisma.webhookLog.create).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(fetchProviderStatus).not.toHaveBeenCalled();
  });

  it('never trusts the status in the payload: it re-verifies with the operator', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      mtnReferenceId: 'ref-1',
      externalId: 'ext-1',
      merchantId: 'm-1',
      status: 'PENDING',
    });
    fetchProviderStatus.mockResolvedValue({ status: 'FAILED' });

    await service.handleWebhook('MTN', {
      financialTransactionId: 'fin-1',
      externalId: 'tx-1',
      status: 'SUCCESSFUL', // payload lies, real status (mocked) says FAILED
    } as any);

    expect(fetchProviderStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'tx-1', mtnReferenceId: 'ref-1' }));
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { operator: 'MTN', OR: [{ id: 'tx-1' }, { mtnReferenceId: 'tx-1' }] },
    });
    // La transition passe désormais par la machine d'état (SERIALIZABLE + FOR UPDATE).
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(gateway.broadcastToMerchant).toHaveBeenCalledWith('m-1', 'transaction_update', {
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
      financialTransactionId: 'fin-2',
      externalId: 'tx-2',
      status: 'FAILED',
    } as any);

    expect(fetchProviderStatus).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('does nothing if the operator still reports PENDING', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-3',
      mtnReferenceId: 'ref-3',
      externalId: 'ext-3',
      status: 'PENDING',
    });
    fetchProviderStatus.mockResolvedValue({ status: 'PENDING' });

    await service.handleWebhook('MTN', {
      financialTransactionId: 'fin-3',
      externalId: 'tx-3',
      status: 'SUCCESSFUL',
    } as any);

    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(gateway.broadcastToMerchant).not.toHaveBeenCalled();
  });

  it('déduplique un event déjà reçu (P2002) sans retraiter (ALP-157)', async () => {
    const dupErr: any = new Error('unique');
    dupErr.code = 'P2002';
    prisma.webhookInboundEvent.create.mockRejectedValue(dupErr);

    const result = await service.handleWebhook('MTN', {
      financialTransactionId: 'ref-dup',
      status: 'SUCCESSFUL',
    } as any);

    expect(result).toEqual({ received: true, duplicate: true });
    expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('ignore un webhook sans identifiant d\'event exploitable', async () => {
    const result = await service.handleWebhook('MTN', { status: 'SUCCESSFUL' } as any);
    expect(result).toEqual({ received: true });
    expect(prisma.webhookInboundEvent.create).not.toHaveBeenCalled();
  });

  it('retrouve une transaction Airtel par notre identifiant de transaction et confirme son statut', async () => {
    prisma.transaction.findFirst.mockResolvedValue({
      id: 'tx-4',
      mtnReferenceId: 'ref-4',
      externalId: 'ext-4',
      operator: 'AIRTEL',
      status: 'PENDING',
    });
    fetchProviderStatus.mockResolvedValue({ status: 'SUCCEEDED' });

    await service.handleWebhook('AIRTEL', {
      transaction: { id: 'ref-4', status_code: 'TS', airtel_money_id: 'am-4' },
    } as any);

    expect(prisma.webhookInboundEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operator: 'AIRTEL', providerEventId: 'am-4' }),
    });
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { operator: 'AIRTEL', OR: [{ id: 'ref-4' }, { mtnReferenceId: 'ref-4' }] },
    });
    expect(fetchProviderStatus).toHaveBeenCalledWith(expect.objectContaining({ operator: 'AIRTEL' }));
  });
});
