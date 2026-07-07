import { ServiceUnavailableException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { WalletFloatReconciliationService } from './wallet-float-reconciliation.service';
import { NotificationService } from '../notifications/notification.service';
import { MetricsService } from '../metrics/metrics.service';

type PrismaMock = {
  wallet: { aggregate: jest.Mock };
  walletTransaction: { groupBy: jest.Mock };
  walletReconciliationRun: { create: jest.Mock; findFirst: jest.Mock };
  $queryRaw: jest.Mock;
};

function makeService() {
  const prisma: PrismaMock = {
    wallet: { aggregate: jest.fn() },
    walletTransaction: { groupBy: jest.fn() },
    walletReconciliationRun: {
      create: jest.fn().mockResolvedValue({ id: 'run1' }),
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]),
  };
  const notifications = { send: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationService;
  const metrics = { walletFloatDriftCents: { set: jest.fn() } } as unknown as MetricsService;

  const service = new WalletFloatReconciliationService(prisma as never, notifications, metrics);
  return { service, prisma, notifications, metrics };
}

/** Groupe (type, status) → montant, format renvoyé par prisma.groupBy. */
function grp(rows: Array<[string, string, bigint]>) {
  return rows.map(([type, status, amount]) => ({ type, status, _sum: { amountCents: amount } }));
}

describe('WalletFloatReconciliationService — invariant float (ALP-175)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('drift = 0 : pas d\'alerte, email de résumé, métrique à 0', async () => {
    const { service, prisma, notifications, metrics } = makeService();
    // 3 cash-in (10000) − 1 pay (4000) − 1 cash-out success (1000) = 5000
    prisma.wallet.aggregate.mockResolvedValue({ _sum: { balanceCents: 5000n }, _count: { _all: 2 } });
    prisma.walletTransaction.groupBy.mockResolvedValue(grp([
      ['CASH_IN', 'SUCCESSFUL', 10000n],
      ['PAY', 'SUCCESSFUL', 4000n],
      ['CASH_OUT', 'SUCCESSFUL', 1000n],
    ]));

    const res = await service.run();

    expect(res.driftCents).toBe('0');
    expect(res.alert).toBe(false);
    expect(res.floatExposureCents).toBe('9000'); // 10000 − 1000
    expect((metrics.walletFloatDriftCents.set as jest.Mock)).toHaveBeenCalledWith(0);
    expect((notifications.send as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'ops.wallet-float-summary' }),
    );
  });

  it('compte les cash-out PENDING comme débités (débit immédiat)', async () => {
    const { service, prisma } = makeService();
    // cash-in 10000 − cash-out PENDING 2000 = 8000 attendu
    prisma.wallet.aggregate.mockResolvedValue({ _sum: { balanceCents: 8000n }, _count: { _all: 1 } });
    prisma.walletTransaction.groupBy.mockResolvedValue(grp([
      ['CASH_IN', 'SUCCESSFUL', 10000n],
      ['CASH_OUT', 'PENDING', 2000n],
    ]));

    const res = await service.run();
    expect(res.driftCents).toBe('0');
    expect(res.alert).toBe(false);
  });

  it('exclut REFUND et cash-out FAILED (ils s\'annulent)', async () => {
    const { service, prisma } = makeService();
    // Un cash-out échoué : FAILED 3000 (non compté) + REFUND 3000 (exclu). Balance nette 0.
    prisma.wallet.aggregate.mockResolvedValue({ _sum: { balanceCents: 10000n }, _count: { _all: 1 } });
    prisma.walletTransaction.groupBy.mockResolvedValue(grp([
      ['CASH_IN', 'SUCCESSFUL', 10000n],
      ['CASH_OUT', 'FAILED', 3000n],
      ['REFUND', 'SUCCESSFUL', 3000n],
    ]));

    const res = await service.run();
    expect(res.driftCents).toBe('0');
    expect(res.alert).toBe(false);
  });

  it('détecte une dérive : alerte SMS ops + Sentry + métrique', async () => {
    const { service, prisma, notifications, metrics } = makeService();
    const captureSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => 'id');
    // Balance 9999 mais attendu 5000 → dérive +4999 (argent créé hors transaction)
    prisma.wallet.aggregate.mockResolvedValue({ _sum: { balanceCents: 9999n }, _count: { _all: 2 } });
    prisma.walletTransaction.groupBy.mockResolvedValue(grp([
      ['CASH_IN', 'SUCCESSFUL', 5000n],
    ]));

    const res = await service.run();

    expect(res.driftCents).toBe('4999');
    expect(res.alert).toBe(true);
    expect((metrics.walletFloatDriftCents.set as jest.Mock)).toHaveBeenCalledWith(4999);
    expect(captureSpy).toHaveBeenCalled();
    expect((notifications.send as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'ops.wallet-float-alert', channel: 'SMS' }),
    );
  });

  it('alerte si un wallet est incohérent même sans dérive globale', async () => {
    const { service, prisma } = makeService();
    prisma.wallet.aggregate.mockResolvedValue({ _sum: { balanceCents: 5000n }, _count: { _all: 3 } });
    prisma.walletTransaction.groupBy.mockResolvedValue(grp([['CASH_IN', 'SUCCESSFUL', 5000n]]));
    prisma.$queryRaw.mockResolvedValue([{ count: 2n }]); // 2 wallets incohérents

    const res = await service.run();
    expect(res.driftCents).toBe('0');
    expect(res.inconsistentWalletCount).toBe(2);
    expect(res.alert).toBe(true);
  });

  it('gère une base vide (aucun wallet)', async () => {
    const { service, prisma } = makeService();
    prisma.wallet.aggregate.mockResolvedValue({ _sum: { balanceCents: null }, _count: { _all: 0 } });
    prisma.walletTransaction.groupBy.mockResolvedValue([]);

    const res = await service.run();
    expect(res.totalBalanceCents).toBe('0');
    expect(res.driftCents).toBe('0');
    expect(res.alert).toBe(false);
  });
});

describe('WalletFloatReconciliationService — garde-fou cash-out', () => {
  it('gèle les cash-out si la dernière réconciliation dépasse le seuil critique', async () => {
    const { service, prisma } = makeService();
    prisma.walletReconciliationRun.findFirst.mockResolvedValue({ driftCents: 50_000n });
    await expect(service.assertFloatHealthy()).rejects.toThrow(ServiceUnavailableException);
  });

  it('laisse passer si la dérive est sous le seuil (marge de tolérance)', async () => {
    const { service, prisma } = makeService();
    prisma.walletReconciliationRun.findFirst.mockResolvedValue({ driftCents: 50n });
    await expect(service.assertFloatHealthy()).resolves.toBeUndefined();
  });

  it('laisse passer si aucune réconciliation n\'a encore tourné', async () => {
    const { service, prisma } = makeService();
    prisma.walletReconciliationRun.findFirst.mockResolvedValue(null);
    await expect(service.assertFloatHealthy()).resolves.toBeUndefined();
  });

  it('gèle aussi sur une dérive négative importante', async () => {
    const { service, prisma } = makeService();
    prisma.walletReconciliationRun.findFirst.mockResolvedValue({ driftCents: -50_000n });
    await expect(service.assertFloatHealthy()).rejects.toThrow(ServiceUnavailableException);
  });
});
