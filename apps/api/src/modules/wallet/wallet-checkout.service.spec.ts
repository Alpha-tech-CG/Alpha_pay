import { WalletService } from './wallet.service';
import { WalletAuthService } from './wallet-auth.service';
import { QrSigningService } from './qr-signing.service';
import { WalletFloatReconciliationService } from './wallet-float-reconciliation.service';
import { NotificationService } from '../notifications/notification.service';
import { WebhookDeliveryService } from '../webhooks-out/webhook-delivery.service';
import { CurrencyService } from '../currency/currency.service';
import { WalletLimitsService } from './wallet-limits.service';

/**
 * Client de transaction simulé : capture les créations wallet/transaction et
 * pilote le débit conditionnel (#conditionalDebit lit wallet.updateMany +
 * findUniqueOrThrow).
 */
function makeTxClient(balanceAfterDebit: bigint) {
  const created: { walletTx?: any; merchantTx?: any } = {};
  const tx = {
    paymentLink: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    wallet: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ balanceCents: balanceAfterDebit }),
    },
    walletTransaction: {
      create: jest.fn((args: any) => {
        created.walletTx = args.data;
        return Promise.resolve({ id: 'wtx1', ...args.data });
      }),
    },
    transaction: {
      create: jest.fn((args: any) => {
        created.merchantTx = args.data;
        return Promise.resolve({ id: 'mtx1' });
      }),
    },
  };
  return { tx, created };
}

function makeService(opts: {
  link: any;
  balanceAfterDebit: bigint;
  convert?: jest.Mock;
}) {
  const { tx, created } = makeTxClient(opts.balanceAfterDebit);
  const prisma: any = {
    paymentLink: { findUnique: jest.fn().mockResolvedValue(opts.link) },
    walletTransaction: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(tx)),
  };
  const walletAuth = {
    verifyPin: jest.fn().mockResolvedValue({ id: 'w1', phone: '242066000001', currency: 'XAF' }),
  } as unknown as WalletAuthService;
  const notifications = { send: jest.fn() } as unknown as NotificationService;
  const qrSigning = {} as QrSigningService;
  const floatRecon = { assertFloatHealthy: jest.fn() } as unknown as WalletFloatReconciliationService;
  const webhookDelivery = { dispatch: jest.fn().mockResolvedValue(0) } as unknown as WebhookDeliveryService;
  const currency = { convert: opts.convert ?? jest.fn() } as unknown as CurrencyService;
  const limits = {
    assertWithinDebitLimits: jest.fn().mockResolvedValue(undefined),
    assertWithinBalanceCap: jest.fn().mockResolvedValue(undefined),
  } as unknown as WalletLimitsService;

  const service = new WalletService(
    prisma, notifications, qrSigning, walletAuth, floatRecon, webhookDelivery, currency, limits,
  );
  return { service, created, prisma, currency, webhookDelivery };
}

describe('WalletService.payPaylink — multi-devises (ALP-170)', () => {
  it('même devise (XAF) : débit = montant du lien, pas de FX', async () => {
    // Lien XAF 5000 → 500000 centimes (×100)
    const link = {
      id: 'pl1', amount: 500000n, currency: 'XAF', description: 'Achat',
      expiresAt: null, usedAt: null, merchant: { id: 'm1', name: 'Boutique', isActive: true },
    };
    const { service, created, webhookDelivery } = makeService({ link, balanceAfterDebit: 500000n });

    const res: any = await service.payPaylink('pl1', { phone: '242066000001', pin: '1234' } as any);

    expect(created.walletTx.amountCents).toBe(500000n);
    expect(created.walletTx.metadata).toBeUndefined();
    expect(created.merchantTx.amount).toBe(500000n);
    expect(created.merchantTx.currency).toBe('XAF');
    expect(res.amountCents).toBe(500000);
    expect(res.currency).toBe('XAF');
    expect(res.merchantCurrency).toBe('XAF');
    expect((webhookDelivery.dispatch as jest.Mock)).toHaveBeenCalledWith(
      'm1', 'payment.succeeded', expect.objectContaining({ amount: 500000, currency: 'XAF' }),
    );
  });

  it('lien USD payé depuis un wallet XAF : conversion, débit XAF, marchand crédité en USD', async () => {
    // Lien USD 10 → 1000 centimes (×100). Taux 1 USD = 610 XAF → 6100 XAF = 610000 centimes.
    const link = {
      id: 'pl2', amount: 1000n, currency: 'USD', description: 'Abonnement',
      expiresAt: null, usedAt: null, merchant: { id: 'm2', name: 'SaaS Corp', isActive: true },
    };
    const convert = jest.fn().mockResolvedValue({
      from: 'USD', to: 'XAF', rate: 610, amount: 10, convertedAmount: 6100, formatted: '6 100 FCFA',
    });
    // Après débit de 610000, il reste 390000 → balanceBefore = 1000000 (10000 XAF).
    const { service, created, webhookDelivery } = makeService({ link, balanceAfterDebit: 390000n, convert });

    const res: any = await service.payPaylink('pl2', { phone: '242066000001', pin: '1234' } as any);

    expect(convert).toHaveBeenCalledWith(10, 'USD', 'XAF');
    // Wallet débité en XAF (converti)
    expect(created.walletTx.amountCents).toBe(610000n);
    expect(created.walletTx.metadata).toEqual({
      fx: { originalAmountCents: 1000, originalCurrency: 'USD', rate: 610, walletCurrency: 'XAF' },
    });
    // Marchand crédité dans la devise du lien (USD), montant inchangé
    expect(created.merchantTx.amount).toBe(1000n);
    expect(created.merchantTx.currency).toBe('USD');
    // Réponse
    expect(res.amountCents).toBe(610000);   // payé en XAF
    expect(res.currency).toBe('XAF');
    expect(res.merchantAmountCents).toBe(1000);
    expect(res.merchantCurrency).toBe('USD');
    expect(res.fxRate).toBe(610);
    // Webhook marchand = devise du lien
    expect((webhookDelivery.dispatch as jest.Mock)).toHaveBeenCalledWith(
      'm2', 'payment.succeeded', expect.objectContaining({ amount: 1000, currency: 'USD', method: 'WALLET' }),
    );
  });

  it('propage l\'erreur si aucun taux n\'est configuré', async () => {
    const link = {
      id: 'pl3', amount: 500n, currency: 'EUR', description: null,
      expiresAt: null, usedAt: null, merchant: { id: 'm3', name: 'X', isActive: true },
    };
    const convert = jest.fn().mockRejectedValue(new Error('Aucun taux de change configuré pour EUR → XAF'));
    const { service } = makeService({ link, balanceAfterDebit: 0n, convert });

    await expect(service.payPaylink('pl3', { phone: '242066000001', pin: '1234' } as any))
      .rejects.toThrow(/taux de change/i);
  });
});
