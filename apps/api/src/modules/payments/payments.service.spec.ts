import { UnprocessableEntityException } from '@nestjs/common';
import { MOCK_MOBILE_MONEY_NUMBERS, MockMobileMoneyProvider, ProviderError } from '@paybrain/providers';
import { PaymentsService, toStoredStatus } from './payments.service';
import { InMemoryJobQueue } from '../../common/queue/in-memory-job-queue';

describe('PaymentsService', () => {
  let prisma: any;
  let registry: { forMerchant: jest.Mock };
  let provider: { requestPayment: jest.Mock; getPaymentStatus: jest.Mock };
  let service: PaymentsService;
  let queue: InMemoryJobQueue;

  beforeEach(() => {
    prisma = {
      transaction: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };
    provider = { requestPayment: jest.fn(), getPaymentStatus: jest.fn() };
    registry = { forMerchant: jest.fn().mockResolvedValue(provider) };
    queue = new InMemoryJobQueue();
    service = new PaymentsService(prisma, registry as any, queue);
  });

  it('résout l’opérateur depuis le préfixe et envoie la demande avec l’id de transaction comme référence', async () => {
    provider.requestPayment.mockResolvedValue({ providerRef: 'ref-mtn', status: 'pending' });
    prisma.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-1', ...data }));

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', externalId: 'ext-1' } as any,
      'merchant-1',
    );

    expect(registry.forMerchant).toHaveBeenCalledWith('merchant-1', 'MTN', false);
    expect(provider.requestPayment).toHaveBeenCalledWith({
      amount: 10_000, // 100 EUR en centimes (unités mineures, D-007)
      currency: 'EUR',
      payerPhone: '+46733123450',
      reference: 'tx-1',
      description: undefined,
    });
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operator: 'MTN', merchantId: 'merchant-1', livemode: false }),
    });
    expect(prisma.transaction.update).toHaveBeenCalledWith({ where: { id: 'tx-1' }, data: { mtnReferenceId: 'ref-mtn' } });
    expect(result).toEqual({ referenceId: 'ref-mtn', transactionId: 'tx-1', operator: 'MTN', status: 'PENDING' });
    expect(queue.jobs).toEqual([
      expect.objectContaining({ queue: 'payment-status', data: { transactionId: 'tx-1', attempt: 0 }, opts: { delayMs: 5000, jobId: 'poll-tx-1-0' } }),
    ]);
  });

  it('transmet le mode live au registre et convertit le XAF sans décimale', async () => {
    provider.requestPayment.mockResolvedValue({ providerRef: 'r', status: 'pending' });
    prisma.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-live', ...data }));

    await service.initiatePayment(
      { amount: 15000, currency: 'XAF', phone: '+242060000001', externalId: 'e', operator: 'MTN' } as any,
      'm',
      true,
    );

    expect(registry.forMerchant).toHaveBeenCalledWith('m', 'MTN', true);
    expect(provider.requestPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 15000, currency: 'XAF' }));
    expect(prisma.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ livemode: true }) });
  });

  it('respecte l’opérateur choisi par l’appelant', async () => {
    provider.requestPayment.mockResolvedValue({ providerRef: 'r', status: 'pending' });
    prisma.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-2', ...data }));

    await service.initiatePayment(
      { amount: 50, currency: 'XAF', phone: '+242060000001', externalId: 'ext-2', operator: 'AIRTEL' } as any,
      'merchant-1',
    );

    expect(registry.forMerchant).toHaveBeenCalledWith('merchant-1', 'AIRTEL', false);
  });

  it('refuse un numéro sans préfixe opérateur reconnu', async () => {
    await expect(
      service.initiatePayment({ amount: 10, currency: 'EUR', phone: '242099999999', externalId: 'ext-3' } as any, 'merchant-1'),
    ).rejects.toMatchObject({ status: 400, response: expect.objectContaining({ code: 'telephone_invalide', param: 'phone' }) });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rejoue la transaction existante pour un externalId déjà traité (idempotence)', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx-existing', mtnReferenceId: 'ref-existing', operator: 'MTN', status: 'PENDING' });

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', externalId: 'ext-dup' } as any,
      'merchant-1',
    );

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(provider.requestPayment).not.toHaveBeenCalled();
    expect(result).toEqual({ referenceId: 'ref-existing', transactionId: 'tx-existing', operator: 'MTN', status: 'PENDING', idempotent: true });
  });

  it('erreur réseau : la transaction reste en attente et l’outbox rejouera la demande', async () => {
    provider.requestPayment.mockRejectedValue(new ProviderError('network', 'coupure', { provider: 'mtn' }));
    prisma.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-net', ...data }));

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', externalId: 'ext-net' } as any,
      'merchant-1',
    );

    expect(prisma.transaction.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ transactionId: 'tx-net', type: 'payment.request', status: 'PENDING', payload: { operator: 'MTN', livemode: false } }),
    });
    // Aucune donnée personnelle dans l'outbox.
    expect(JSON.stringify(prisma.outboxEvent.create.mock.calls)).not.toContain('46733123450');
    expect(result).toEqual(expect.objectContaining({ status: 'PENDING', retrying: true }));
  });

  it('erreur définitive : la transaction passe en échec sans nouvelle tentative', async () => {
    provider.requestPayment.mockRejectedValue(new ProviderError('invalid_request', 'HTTP 400', { provider: 'mtn' }));
    prisma.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-fail', ...data }));

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', externalId: 'ext-fail' } as any,
      'merchant-1',
    );

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-fail' },
      data: { status: 'FAILED', failureReason: 'invalid_request: HTTP 400' },
    });
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ status: 'FAILED' }));
  });

  it('compte opérateur non connecté en live : 422 operateur_non_connecte', async () => {
    registry.forMerchant.mockRejectedValue(new ProviderError('not_configured', 'Compte MTN du marchand non connecté', { provider: 'mtn' }));
    prisma.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-nc', ...data }));

    await expect(
      service.initiatePayment({ amount: 100, currency: 'XAF', phone: '+242060000001', externalId: 'x', operator: 'MTN' } as any, 'm', true),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('de bout en bout avec l’opérateur factice : demande puis statut réussi', async () => {
    let now = 0;
    const mock = new MockMobileMoneyProvider({ now: () => now });
    registry.forMerchant.mockResolvedValue(mock);
    prisma.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-mock', ...data }));

    const res = await service.initiatePayment(
      { amount: 2500, currency: 'XAF', phone: MOCK_MOBILE_MONEY_NUMBERS.success, externalId: 'e2e', operator: 'MTN' } as any,
      'm',
    );
    now += 1_000;
    const status = await service.fetchProviderStatus({ merchantId: 'm', operator: 'MTN', livemode: false, mtnReferenceId: res.referenceId! });
    expect(status).toEqual({ status: 'SUCCESSFUL' });
  });
});

describe('toStoredStatus', () => {
  it.each([
    [{ status: 'succeeded' }, { status: 'SUCCESSFUL' }],
    [{ status: 'failed', failureReason: 'X' }, { status: 'FAILED', failureReason: 'X' }],
    [{ status: 'expired' }, { status: 'FAILED', failureReason: 'EXPIRED' }],
    [{ status: 'canceled' }, { status: 'REJECTED' }],
    [{ status: 'pending' }, { status: 'PENDING' }],
  ] as const)('%j → %j', (input, expected) => {
    expect(toStoredStatus(input as any)).toEqual(expected);
  });
});
