import { MOCK_MOBILE_MONEY_NUMBERS, MockMobileMoneyProvider } from '@paybrain/providers';
import { InMemoryJobQueue } from '../../common/queue/in-memory-job-queue';
import { PaymentsService } from '../payments/payments.service';
import { nextPollDelayMs, PaymentStatusPoller } from './payment-status.poller';

describe('nextPollDelayMs', () => {
  it('croît puis plafonne à 60 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(nextPollDelayMs)).toEqual([5000, 10000, 20000, 40000, 60000, 60000, 60000]);
  });
});

describe('PaymentStatusPoller', () => {
  let now: number;
  let txs: Map<string, any>;
  let prisma: any;
  let queue: InMemoryJobQueue;
  let webhooks: { applyVerifiedStatus: jest.Mock };
  let payments: PaymentsService;
  let poller: PaymentStatusPoller;
  const realNow = Date.now;

  beforeEach(() => {
    now = 1_800_000_000_000;
    Date.now = () => now;
    txs = new Map();
    prisma = {
      transaction: {
        create: jest.fn(async ({ data }) => {
          const tx = { id: `tx-${txs.size + 1}`, createdAt: new Date(now), mtnReferenceId: null, ...data, amount: data.amount };
          txs.set(tx.id, tx);
          return tx;
        }),
        update: jest.fn(async ({ where, data }) => Object.assign(txs.get(where.id), data)),
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async ({ where }) => txs.get(where.id) ?? null),
      },
      outboxEvent: { create: jest.fn() },
    };
    queue = new InMemoryJobQueue();
    const mock = new MockMobileMoneyProvider({ now: () => now });
    payments = new PaymentsService(prisma, { forMerchant: jest.fn().mockResolvedValue(mock) } as any, queue);
    webhooks = {
      applyVerifiedStatus: jest.fn(async (tx, status) => {
        tx.status = status;
        return true;
      }),
    };
    poller = new PaymentStatusPoller(prisma, payments, webhooks as any, queue);
    poller.register();
  });

  afterEach(() => {
    Date.now = realNow;
  });

  const pay = (phone: string) =>
    payments.initiatePayment({ amount: 1000, currency: 'XAF', phone, externalId: `e-${phone}`, operator: 'MTN' } as any, 'm');

  it('relance à intervalles croissants puis applique le statut réussi confirmé', async () => {
    const { transactionId } = await pay(MOCK_MOBILE_MONEY_NUMBERS.slow); // réussit après 15 s

    now += 5_000;
    await queue.drain('payment-status'); // relance 0 : toujours en attente
    expect(queue.jobs).toEqual([expect.objectContaining({ opts: expect.objectContaining({ delayMs: 10_000, jobId: `poll-${transactionId}-1` }) })]);

    now += 10_000;
    await queue.drain('payment-status'); // relance 1 : réussi
    expect(webhooks.applyVerifiedStatus).toHaveBeenCalledWith(expect.objectContaining({ id: transactionId }), 'SUCCESSFUL', undefined, 'relance de statut');
    expect(queue.jobs).toHaveLength(0);
  });

  it('déclare expiré un paiement resté sans réponse au-delà du délai', async () => {
    process.env.PAYMENT_EXPIRY_SECONDS = '20';
    const { transactionId } = await pay(MOCK_MOBILE_MONEY_NUMBERS.expire); // l'opérateur ne répond qu'à 30 s
    now += 25_000;
    await queue.drain('payment-status');
    expect(webhooks.applyVerifiedStatus).toHaveBeenCalledWith(expect.objectContaining({ id: transactionId }), 'FAILED', 'EXPIRED', 'relance : expiration');
    delete process.env.PAYMENT_EXPIRY_SECONDS;
  });

  it('ne fait rien pour un paiement déjà final (callback arrivé avant la relance)', async () => {
    const { transactionId } = await pay(MOCK_MOBILE_MONEY_NUMBERS.success);
    txs.get(transactionId).status = 'SUCCESSFUL';
    await queue.drain('payment-status');
    expect(webhooks.applyVerifiedStatus).not.toHaveBeenCalled();
    expect(queue.jobs).toHaveLength(0);
  });

  it('un paiement refusé par le payeur aboutit à FAILED', async () => {
    await pay(MOCK_MOBILE_MONEY_NUMBERS.failure);
    await queue.drain('payment-status');
    expect(webhooks.applyVerifiedStatus).toHaveBeenCalledWith(expect.anything(), 'FAILED', 'APPROVAL_REJECTED', 'relance de statut');
  });
});
