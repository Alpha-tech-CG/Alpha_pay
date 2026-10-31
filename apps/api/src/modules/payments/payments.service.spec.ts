import { MOCK_MOBILE_MONEY_NUMBERS, MockMobileMoneyProvider, ProviderError } from '@paybrain/providers';
import { PaymentsService, toStoredStatus } from './payments.service';
import { InMemoryJobQueue } from '../../common/queue/in-memory-job-queue';

describe('PaymentsService', () => {
  let prisma: any;
  let registry: { forMerchant: jest.Mock };
  let provider: { requestPayment: jest.Mock; getPaymentStatus: jest.Mock };
  let service: PaymentsService;
  let queue: InMemoryJobQueue;
  let rows: Map<string, any>;
  /** create() qui conserve la ligne pour la relecture finale. */
  const created = (id: string) => async ({ data }: any) => {
    const row = { id, ...data };
    rows.set(id, row);
    return row;
  };

  beforeEach(() => {
    rows = new Map();
    prisma = {
      transaction: {
        create: jest.fn(),
        update: jest.fn(async ({ where, data }: any) => Object.assign(rows.get(where.id) ?? {}, data)),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(async ({ where }: any) => rows.get(where.id)),
      },
      outboxEvent: { create: jest.fn() },
      merchant: { findUnique: jest.fn().mockResolvedValue({ onboardingStatus: 'APPROVED' }) },
      till: { findFirst: jest.fn() },
      // Palier sans plafond mensuel (quota M11 testé en intégration).
      subscription: { findUnique: jest.fn().mockResolvedValue(null) },
      billingPlan: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    provider = { requestPayment: jest.fn(), getPaymentStatus: jest.fn() };
    registry = { forMerchant: jest.fn().mockResolvedValue(provider) };
    queue = new InMemoryJobQueue();
    service = new PaymentsService(prisma, registry as any, queue, {} as any);
  });

  it('résout l’opérateur depuis le préfixe et envoie la demande avec l’id de transaction comme référence', async () => {
    provider.requestPayment.mockResolvedValue({ providerRef: 'ref-mtn', status: 'pending' });
    prisma.transaction.create.mockImplementation(created('tx-1'));

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', reference: 'ext-1' } as any,
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
    expect(result).toMatchObject({ id: 'tx-1', mtnReferenceId: 'ref-mtn', operator: 'MTN', status: 'PENDING' });
    expect(queue.jobs).toEqual([
      expect.objectContaining({ queue: 'payment-status', data: { transactionId: 'tx-1', attempt: 0 }, opts: { delayMs: 5000, jobId: 'poll-tx-1-0' } }),
    ]);
  });

  it('transmet le mode live au registre et convertit le XAF sans décimale', async () => {
    provider.requestPayment.mockResolvedValue({ providerRef: 'r', status: 'pending' });
    prisma.transaction.create.mockImplementation(created('tx-live'));

    await service.initiatePayment(
      { amount: 15000, currency: 'XAF', phone: '+242060000001', reference: 'e', operator: 'MTN' } as any,
      'm',
      true,
    );

    expect(registry.forMerchant).toHaveBeenCalledWith('m', 'MTN', true);
    expect(provider.requestPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 15000, currency: 'XAF' }));
    expect(prisma.transaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ livemode: true }) });
  });

  it('respecte l’opérateur choisi par l’appelant', async () => {
    provider.requestPayment.mockResolvedValue({ providerRef: 'r', status: 'pending' });
    prisma.transaction.create.mockImplementation(created('tx-2'));

    await service.initiatePayment(
      { amount: 50, currency: 'XAF', phone: '+242060000001', reference: 'ext-2', operator: 'AIRTEL' } as any,
      'merchant-1',
    );

    expect(registry.forMerchant).toHaveBeenCalledWith('merchant-1', 'AIRTEL', false);
  });

  it('refuse un numéro sans préfixe opérateur reconnu', async () => {
    await expect(
      service.initiatePayment({ amount: 10, currency: 'EUR', phone: '242099999999', reference: 'ext-3' } as any, 'merchant-1'),
    ).rejects.toMatchObject({ status: 400, response: expect.objectContaining({ code: 'telephone_invalide', param: 'phone' }) });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('rejoue la transaction existante pour un externalId déjà traité (idempotence)', async () => {
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx-existing', mtnReferenceId: 'ref-existing', operator: 'MTN', status: 'PENDING' });

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', reference: 'ext-dup' } as any,
      'merchant-1',
    );

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(provider.requestPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'tx-existing', mtnReferenceId: 'ref-existing' });
  });

  it('erreur réseau : la transaction reste en attente et l’outbox rejouera la demande', async () => {
    provider.requestPayment.mockRejectedValue(new ProviderError('network', 'coupure', { provider: 'mtn' }));
    prisma.transaction.create.mockImplementation(created('tx-net'));

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', reference: 'ext-net' } as any,
      'merchant-1',
    );

    expect(prisma.transaction.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ transactionId: 'tx-net', type: 'payment.request', status: 'PENDING', payload: { operator: 'MTN', livemode: false } }),
    });
    // Aucune donnée personnelle dans l'outbox.
    expect(JSON.stringify(prisma.outboxEvent.create.mock.calls)).not.toContain('46733123450');
    expect(result).toMatchObject({ id: 'tx-net', status: 'PENDING' });
  });

  it('erreur définitive : la transaction passe en échec sans nouvelle tentative', async () => {
    provider.requestPayment.mockRejectedValue(new ProviderError('invalid_request', 'HTTP 400', { provider: 'mtn' }));
    prisma.transaction.create.mockImplementation(created('tx-fail'));

    const result = await service.initiatePayment(
      { amount: 100, currency: 'EUR', phone: '46733123450', reference: 'ext-fail' } as any,
      'merchant-1',
    );

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-fail' },
      data: { status: 'FAILED', failureReason: 'invalid_request: HTTP 400' },
    });
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'FAILED', failureReason: 'invalid_request: HTTP 400' });
  });

  it('compte opérateur non connecté en live : 422 operateur_non_connecte', async () => {
    registry.forMerchant.mockRejectedValue(new ProviderError('not_configured', 'Compte MTN du marchand non connecté', { provider: 'mtn' }));
    prisma.transaction.create.mockImplementation(created('tx-nc'));

    await expect(
      service.initiatePayment({ amount: 100, currency: 'XAF', phone: '+242060000001', reference: 'x', operator: 'MTN' } as any, 'm', true),
    ).rejects.toMatchObject({ status: 422, response: expect.objectContaining({ code: 'operateur_non_connecte' }) });
  });

  it('mode live sans KYB approuvé : 403 kyb_non_valide, aucune transaction créée (T-61)', async () => {
    prisma.merchant.findUnique.mockResolvedValue({ onboardingStatus: 'PENDING' });
    await expect(
      service.initiatePayment({ amount: 100, currency: 'XAF', phone: '+242060000001', reference: 'x', operator: 'MTN' }, 'm', true),
    ).rejects.toMatchObject({ status: 403, response: expect.objectContaining({ code: 'kyb_non_valide' }) });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(registry.forMerchant).not.toHaveBeenCalled();
  });

  it('rattache le paiement à la caisse et à sa boutique ; caisse inconnue refusée', async () => {
    provider.requestPayment.mockResolvedValue({ providerRef: 'r', status: 'pending' });
    prisma.transaction.create.mockImplementation(created('tx-till'));
    prisma.till.findFirst.mockResolvedValueOnce({ storeId: 's1' }).mockResolvedValueOnce(null);

    const tx = await service.initiatePayment({ amount: 100, currency: 'XAF', phone: '+242060000001', reference: 'c1', tillId: 't1' }, 'm');
    expect(tx).toMatchObject({ storeId: 's1', tillId: 't1' });
    expect(prisma.till.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1', merchantId: 'm', active: true } }));

    await expect(
      service.initiatePayment({ amount: 100, currency: 'XAF', phone: '+242060000001', reference: 'c2', tillId: 'autre' }, 'm'),
    ).rejects.toMatchObject({ status: 404, response: expect.objectContaining({ code: 'caisse_introuvable', param: 'till_id' }) });
  });

  it('de bout en bout avec l’opérateur factice : demande puis statut réussi', async () => {
    let now = 0;
    const mock = new MockMobileMoneyProvider({ now: () => now });
    registry.forMerchant.mockResolvedValue(mock);
    prisma.transaction.create.mockImplementation(created('tx-mock'));

    const res = await service.initiatePayment(
      { amount: 2500, currency: 'XAF', phone: MOCK_MOBILE_MONEY_NUMBERS.success, reference: 'e2e', operator: 'MTN' } as any,
      'm',
    );
    now += 1_000;
    const status = await service.fetchProviderStatus({ merchantId: 'm', operator: 'MTN', livemode: false, mtnReferenceId: res.mtnReferenceId! });
    expect(status).toEqual({ status: 'SUCCEEDED' });
  });
});

describe('toStoredStatus', () => {
  it.each([
    [{ status: 'succeeded' }, { status: 'SUCCEEDED' }],
    [{ status: 'failed', failureReason: 'X' }, { status: 'FAILED', failureReason: 'X' }],
    [{ status: 'expired' }, { status: 'EXPIRED' }],
    [{ status: 'canceled' }, { status: 'CANCELED' }],
    [{ status: 'pending' }, { status: 'PENDING' }],
  ] as const)('%j → %j', (input, expected) => {
    expect(toStoredStatus(input as any)).toEqual(expected);
  });
});
