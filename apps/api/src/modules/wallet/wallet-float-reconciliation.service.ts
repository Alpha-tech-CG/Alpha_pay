import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import * as Sentry from '@sentry/node';
import { NotificationService } from '../notifications/notification.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Réconciliation du float wallet (ALP-175).
 *
 * Vérifie deux invariants du sous-système wallet closed-loop :
 *
 *  1. Intégrité interne : Σ(soldes wallets) == Σ signée des transactions.
 *     Toute dérive = argent créé/détruit hors d'une transaction enregistrée
 *     (bug de crédit ou fraude interne). L'invariant DOIT valoir exactement 0.
 *
 *  2. Exposition float : Σ(cash-in) − Σ(cash-out) = ce qui doit être détenu sur
 *     les comptes de collecte opérateurs pour couvrir les soldes + la dette de
 *     reversement marchand. Le rapprochement physique avec les relevés
 *     opérateurs relève de la réconciliation opérateur (ALP-140).
 *
 * Détail du calcul du solde théorique — le débit d'un cash-out est immédiat
 * (dès l'initiation, statut PENDING) alors que le crédit d'un cash-in n'a lieu
 * qu'à la confirmation (SUCCESSFUL). D'où l'asymétrie :
 *   + CASH_IN (SUCCESSFUL)      + P2P_RECEIVE (SUCCESSFUL)
 *   − PAY (SUCCESSFUL)          − P2P_SEND (SUCCESSFUL)
 *   − CASH_OUT (PENDING + SUCCESSFUL)   [débité immédiatement]
 * Un cash-out échoué (FAILED/REJECTED) est remboursé par une transaction REFUND :
 * les deux s'annulent et sont donc exclus du calcul.
 */

// Au-delà de ce seuil de dérive, on gèle les nouveaux cash-out (protection
// insolvabilité). L'alerte, elle, se déclenche dès la moindre dérive non nulle.
const CRITICAL_DRIFT_CENTS = 100_00n; // 100 XAF

export interface FloatReport {
  runId: string;
  runDate: string;
  walletCount: number;
  totalBalanceCents: string;
  expectedBalanceCents: string;
  driftCents: string;
  cashInCents: string;
  cashOutCents: string;
  payCents: string;
  floatExposureCents: string;
  inconsistentWalletCount: number;
  alert: boolean;
}

@Injectable()
export class WalletFloatReconciliationService {
  private readonly logger = new Logger(WalletFloatReconciliationService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly metrics: MetricsService,
  ) {}

  /** Calcule les invariants, persiste le run, met à jour la métrique et alerte si dérive. */
  async run(): Promise<FloatReport> {
    const runDate = new Date();

    const [balanceAgg, grouped, inconsistentWalletCount] = await Promise.all([
      this.prisma.wallet.aggregate({ _sum: { balanceCents: true }, _count: { _all: true } }),
      this.prisma.walletTransaction.groupBy({
        by: ['type', 'status'],
        _sum: { amountCents: true },
      }),
      this.#countInconsistentWallets(),
    ]);

    const totalBalance = balanceAgg._sum.balanceCents ?? 0n;
    const walletCount = balanceAgg._count._all;

    const sum = (type: string, status: string): bigint => {
      const row = grouped.find((g) => g.type === type && g.status === status);
      return row?._sum.amountCents ?? 0n;
    };

    const cashInSuccess = sum('CASH_IN', 'SUCCESSFUL');
    const p2pReceive = sum('P2P_RECEIVE', 'SUCCESSFUL');
    const paySuccess = sum('PAY', 'SUCCESSFUL');
    const p2pSend = sum('P2P_SEND', 'SUCCESSFUL');
    const cashOutSuccess = sum('CASH_OUT', 'SUCCESSFUL');
    const cashOutPending = sum('CASH_OUT', 'PENDING');

    const expectedBalance =
      cashInSuccess + p2pReceive - paySuccess - p2pSend - cashOutSuccess - cashOutPending;

    const drift = totalBalance - expectedBalance;
    const floatExposure = cashInSuccess - cashOutSuccess;
    const alert = drift !== 0n || inconsistentWalletCount > 0;

    // Métrique Prometheus (alerte Grafana si != 0).
    this.metrics.walletFloatDriftCents.set(Number(drift));

    const report = {
      runDate: runDate.toISOString().slice(0, 10),
      walletCount,
      totalBalanceCents: totalBalance.toString(),
      expectedBalanceCents: expectedBalance.toString(),
      driftCents: drift.toString(),
      cashInCents: cashInSuccess.toString(),
      cashOutCents: cashOutSuccess.toString(),
      payCents: paySuccess.toString(),
      floatExposureCents: floatExposure.toString(),
      inconsistentWalletCount,
      alert,
    };

    const persisted = await this.prisma.walletReconciliationRun.create({
      data: {
        runDate,
        walletCount,
        totalBalanceCents: totalBalance,
        expectedBalanceCents: expectedBalance,
        driftCents: drift,
        cashInCents: cashInSuccess,
        cashOutCents: cashOutSuccess,
        payCents: paySuccess,
        floatExposureCents: floatExposure,
        inconsistentWalletCount,
        alert,
        reportJson: report as object,
      },
      select: { id: true },
    });

    if (alert) {
      this.logger.error(
        `ALERTE float wallet ${report.runDate} : dérive ${drift} centimes, ` +
        `${inconsistentWalletCount} wallet(s) incohérent(s) (run ${persisted.id})`,
      );
      Sentry.captureMessage(
        `Wallet float drift: ${drift} cents, ${inconsistentWalletCount} inconsistent wallets`,
        'error',
      );
      await this.notifications.send({
        channel: 'SMS',
        to: process.env.OPS_PHONE ?? process.env.OPS_SMS ?? '',
        template: 'ops.wallet-float-alert',
        category: 'wallet_float_alert',
        data: {
          date: report.runDate,
          drift: report.driftCents,
          totalBalance: report.totalBalanceCents,
          expectedBalance: report.expectedBalanceCents,
          inconsistentCount: String(inconsistentWalletCount),
          runId: persisted.id,
        },
      }).catch((err) => this.logger.error(`SMS alerte float échoué: ${err?.message}`));
    } else {
      this.logger.log(
        `Réconciliation float wallet ${report.runDate} : intégrité OK ` +
        `(${walletCount} wallets, ${totalBalance} centimes, run ${persisted.id})`,
      );
      await this.notifications.send({
        channel: 'EMAIL',
        to: process.env.OPS_EMAIL ?? 'ops@paybrain.cg',
        template: 'ops.wallet-float-summary',
        category: 'wallet_float_summary',
        data: {
          date: report.runDate,
          walletCount: String(walletCount),
          totalBalance: report.totalBalanceCents,
          floatExposure: report.floatExposureCents,
          runId: persisted.id,
        },
      }).catch(() => {});
    }

    return { runId: persisted.id, ...report };
  }

  /**
   * Garde-fou insolvabilité : refuse un nouveau cash-out si la dernière
   * réconciliation a détecté une dérive critique. Appelé par WalletService.cashOut.
   */
  async assertFloatHealthy(): Promise<void> {
    const last = await this.prisma.walletReconciliationRun.findFirst({
      orderBy: { runDate: 'desc' },
      select: { driftCents: true },
    });
    if (!last) return; // aucune réconciliation encore : on n'empêche pas les retraits
    const drift = last.driftCents < 0n ? -last.driftCents : last.driftCents;
    if (drift > CRITICAL_DRIFT_CENTS) {
      this.logger.error(`Cash-out gelé : dérive float critique ${last.driftCents} centimes`);
      throw new ServiceUnavailableException(
        'Retraits temporairement indisponibles — maintenance en cours. Réessayez plus tard.',
      );
    }
  }

  /**
   * Compte les wallets dont le solde courant diffère du balance_after de leur
   * dernière transaction (incohérence par compte). DISTINCT ON = dernière tx par
   * wallet selon created_at puis id.
   */
  async #countInconsistentWallets(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT DISTINCT ON (w.id) w.balance_cents, wt.balance_after
        FROM wallets w
        JOIN wallet_transactions wt ON wt.wallet_id = w.id
        ORDER BY w.id, wt.created_at DESC, wt.id DESC
      ) last_tx
      WHERE last_tx.balance_cents <> last_tx.balance_after
    `;
    return Number(rows[0]?.count ?? 0n);
  }
}
