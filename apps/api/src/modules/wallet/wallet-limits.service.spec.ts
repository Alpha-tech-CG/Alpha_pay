import { ForbiddenException } from '@nestjs/common';
import { WalletLimitsService } from './wallet-limits.service';

function makeService(limitRow?: any, groupByRows: any[] = []) {
  const prisma: any = {
    walletLimit: { findUnique: jest.fn().mockResolvedValue(limitRow ?? null) },
    walletTransaction: { groupBy: jest.fn().mockResolvedValue(groupByRows) },
  };
  return { service: new WalletLimitsService(prisma), prisma };
}

// Plafonds N0 par défaut (fallback) : maxBalance 10M, perTx 5M, daily 5M, monthly 20M (centimes).
describe('WalletLimitsService — plafonds e-money (ALP-174)', () => {
  it('utilise les défauts de secours si la table est vide', async () => {
    const { service } = makeService();
    const limit = await service.getLimit('N0');
    expect(limit.maxBalanceCents).toBe(10_000_000n);
    expect(limit.perTxCents).toBe(5_000_000n);
  });

  it('refuse un crédit qui dépasse le plafond de solde', async () => {
    const { service } = makeService();
    // solde 8M + crédit 3M = 11M > 10M (N0)
    await expect(service.assertWithinBalanceCap('N0', 8_000_000n, 3_000_000n))
      .rejects.toThrow(ForbiddenException);
  });

  it('accepte un crédit sous le plafond de solde', async () => {
    const { service } = makeService();
    await expect(service.assertWithinBalanceCap('N0', 8_000_000n, 1_000_000n))
      .resolves.toBeUndefined();
  });

  it('refuse un montant par opération trop élevé', async () => {
    const { service } = makeService();
    // 6M > perTx 5M (N0)
    await expect(service.assertWithinDebitLimits('w1', 'N0', 6_000_000n))
      .rejects.toThrow(/par opération/i);
  });

  it('refuse si le plafond journalier est dépassé', async () => {
    // déjà 4M dépensés aujourd'hui (PAY success) ; +2M = 6M > 5M
    const { service } = makeService(undefined, [
      { type: 'PAY', status: 'SUCCESSFUL', _sum: { amountCents: 4_000_000n } },
    ]);
    await expect(service.assertWithinDebitLimits('w1', 'N0', 2_000_000n))
      .rejects.toThrow(/journalier/i);
  });

  it('compte les CASH_OUT PENDING dans le volume, ignore les FAILED', async () => {
    // CASH_OUT PENDING 3M compte ; PAY FAILED 2M ne compte pas.
    const { service } = makeService(undefined, [
      { type: 'CASH_OUT', status: 'PENDING', _sum: { amountCents: 3_000_000n } },
      { type: 'PAY', status: 'FAILED', _sum: { amountCents: 2_000_000n } },
    ]);
    // 3M (compté) + 2M = 5M == daily 5M → OK (pas de dépassement)
    await expect(service.assertWithinDebitLimits('w1', 'N0', 2_000_000n)).resolves.toBeUndefined();
    // 3M + 2.5M = 5.5M > 5M → refus
    await expect(service.assertWithinDebitLimits('w1', 'N0', 2_500_000n)).rejects.toThrow(/journalier/i);
  });

  it('laisse passer un débit sous tous les plafonds', async () => {
    const { service } = makeService(undefined, []);
    await expect(service.assertWithinDebitLimits('w1', 'N0', 1_000_000n)).resolves.toBeUndefined();
  });

  it('respecte les plafonds N1 (plus élevés) depuis la table', async () => {
    const row = {
      maxBalanceCents: 200_000_000n, perTxCents: 50_000_000n,
      dailyCents: 100_000_000n, monthlyCents: 500_000_000n,
    };
    const { service } = makeService(row, []);
    // 40M par op < 50M perTx N1 → OK (alors que ce serait refusé en N0)
    await expect(service.assertWithinDebitLimits('w1', 'N1', 40_000_000n)).resolves.toBeUndefined();
  });
});
