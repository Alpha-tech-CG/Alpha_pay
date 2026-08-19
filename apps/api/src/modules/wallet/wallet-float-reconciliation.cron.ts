import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WalletFloatReconciliationService } from './wallet-float-reconciliation.service';
import { CronLockService } from '../../common/scheduling/cron-lock.service';

/**
 * Réconciliation quotidienne du float wallet (ALP-175).
 * Tourne à 3h du matin, après la réconciliation opérateur (2h).
 */
@Injectable()
export class WalletFloatReconciliationCron {
  private readonly logger = new Logger(WalletFloatReconciliationCron.name);

  constructor(
    private readonly service: WalletFloatReconciliationService,
    private readonly cronLock: CronLockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDaily() {
    try {
      // Exclusion multi-instance : une seule instance exécute la réconciliation.
      await this.cronLock.runExclusive('wallet-float-reconciliation-daily', async () => {
        await this.service.run();
      });
    } catch (err) {
      this.logger.error(`Réconciliation float wallet échouée: ${(err as Error)?.message}`);
    }
  }
}
