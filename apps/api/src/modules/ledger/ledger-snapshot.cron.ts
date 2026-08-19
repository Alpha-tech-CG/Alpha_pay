import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LedgerService } from './ledger.service';
import { CronLockService } from '../../common/scheduling/cron-lock.service';

/**
 * Snapshots de solde périodiques (ALP-scale).
 *
 * `getAccountBalance` repart du dernier snapshot et n'agrège que les écritures
 * postérieures. Sans snapshots réguliers, chaque lecture de solde rescanne tout
 * l'historique du compte → coût linéaire qui explose avec le volume. Ce cron
 * fige un point pour chaque compte ayant de nouvelles écritures.
 *
 * Toutes les 6h (les lectures de solde restent bornées à ~6h d'écritures), en
 * exclusion multi-instance.
 */
@Injectable()
export class LedgerSnapshotCron {
  private readonly logger = new Logger(LedgerSnapshotCron.name);

  constructor(
    private readonly ledger: LedgerService,
    private readonly cronLock: CronLockService,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async run() {
    await this.cronLock.runExclusive('ledger-snapshot', async () => {
      const taken = await this.ledger.snapshotAllAccounts();
      if (taken > 0) this.logger.log(`${taken} snapshot(s) de solde figé(s)`);
    });
  }
}
